"use strict";

const { UnrecoverableError } = require("bullmq");
const { runDetection } = require("../detection");
const { loadScanRow, resolveMediaInput } = require("./scanSource");

const LOG = "[scan-process]";

/**
 * @param {import('pg').Pool} pool
 * @param {string} scanId
 */
async function markProcessing(pool, scanId) {
  await pool.query(
    `UPDATE scans
     SET status = 'processing',
         error_message = NULL,
         failed_providers = '[]'::jsonb,
         error_payload = NULL,
         provider_statuses = COALESCE(
           (SELECT jsonb_object_agg(p, 'queued'::text)
            FROM unnest(COALESCE(selected_providers, ARRAY[]::text[])) AS p),
           '{}'::jsonb
         ),
         updated_at = NOW()
     WHERE id = $1`,
    [scanId]
  );
}

async function markProviderStatus(pool, { scanId, providerId, status }) {
  const pid = String(providerId || "")
    .trim()
    .toLowerCase();
  const next = String(status || "")
    .trim()
    .toLowerCase();
  if (!pid || !next) {
    return;
  }
  await pool.query(
    `UPDATE scans
     SET provider_statuses = jsonb_set(
       COALESCE(provider_statuses, '{}'::jsonb),
       ARRAY[$2::text],
       to_jsonb($3::text),
       true
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [scanId, pid, next]
  );
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ scanId: string; confidence: unknown; isAiGenerated: unknown; summary: unknown; resultPayload: unknown; detectionProvider?: string | null }} args
 */
async function markCompleted(pool, { scanId, confidence, isAiGenerated, summary, resultPayload, detectionProvider }) {
  await pool.query(
    `UPDATE scans
     SET is_ai_generated = $1,
         confidence = $2,
         summary = $3,
         result_payload = $4,
         error_message = NULL,
         failed_providers = '[]'::jsonb,
         error_payload = NULL,
         status = 'completed',
         detection_provider = $6,
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $5`,
    [isAiGenerated, confidence, summary, resultPayload, scanId, detectionProvider || null]
  );
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ scanId: string; errorMessage: string; failedProviders?: string[] | null; errorPayload?: unknown }} args
 */
async function markFailed(pool, { scanId, errorMessage, failedProviders, errorPayload }) {
  const failed = Array.isArray(failedProviders)
    ? failedProviders
        .map((v) => String(v || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  await pool.query(
    `UPDATE scans
     SET status = 'failed',
         error_message = $1,
         failed_providers = $2::jsonb,
         error_payload = $3::jsonb,
         summary = NULL,
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $4`,
    [errorMessage, JSON.stringify(failed), JSON.stringify(errorPayload || null), scanId]
  );
}

/**
 * Core scan pipeline shared by BullMQ worker and API direct mode.
 *
 * @param {object} opts
 * @param {import('pg').Pool} opts.pool
 * @param {string} opts.scanId
 * @param {string | null | undefined} opts.userId
 * @param {string} [opts.logPrefix]
 * @returns {Promise<{ ok: true; scanId: string; skipped?: boolean; confidence?: unknown }>}
 */
async function processScanById({ pool, scanId, userId, logPrefix = LOG }) {
  if (!scanId) {
    throw new UnrecoverableError("processScanById missing scanId");
  }

  const row = await loadScanRow(pool, scanId);
  if (!row) {
    throw new UnrecoverableError(`Scan row not found for id=${scanId}`);
  }
  if (row.status === "completed") {
    console.info(`${logPrefix} skip scan=${scanId} (already completed)`);
    return { ok: true, scanId, skipped: true };
  }

  console.info(`${logPrefix} processing start scan=${scanId}`);

  await markProcessing(pool, scanId);

  /** @type {{ input: object; release: () => Promise<void> } | undefined} */
  let resolved;
  try {
    resolved = await resolveMediaInput(row);
    const effectiveUserId = userId != null ? userId : row.user_id;
    const storageProvider = row.storage_provider
      ? String(row.storage_provider).trim().toLowerCase()
      : "local";
    const detection = await runDetection(resolved.input, {
      scanId,
      userId: effectiveUserId != null ? String(effectiveUserId) : null,
      storageProvider
    }, {
      onProviderStatus: async ({ providerId, status }) => {
        await markProviderStatus(pool, { scanId, providerId, status });
      },
      providerIds: Array.isArray(row.selected_providers)
        ? row.selected_providers
            .map((id) => String(id || "").trim().toLowerCase())
            .filter(Boolean)
        : undefined
    });

    const primary = detection.primaryDetection;
    await markCompleted(pool, {
      scanId,
      confidence: primary.confidence,
      isAiGenerated: primary.isAiGenerated,
      summary: primary.summary,
      resultPayload: detection.resultPayload,
      detectionProvider: primary.providerId
    });

    console.info(
      `${logPrefix} completed scan=${scanId} providers=${detection.detections.map((d) => d.providerId).join(",")} primary=${primary.providerId} confidence=${primary.confidence} ai=${primary.isAiGenerated}`
    );
    return { ok: true, scanId, confidence: primary.confidence };
  } finally {
    if (resolved) {
      await resolved.release();
    }
  }
}

module.exports = {
  processScanById,
  markProcessing,
  markProviderStatus,
  markCompleted,
  markFailed,
  LOG
};
