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
     SET status = 'processing', error_message = NULL, updated_at = NOW()
     WHERE id = $1`,
    [scanId]
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
 * @param {{ scanId: string; errorMessage: string }} args
 */
async function markFailed(pool, { scanId, errorMessage }) {
  await pool.query(
    `UPDATE scans
     SET status = 'failed',
         error_message = $1,
         summary = NULL,
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $2`,
    [errorMessage, scanId]
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
    });

    await markCompleted(pool, {
      scanId,
      confidence: detection.confidence,
      isAiGenerated: detection.isAiGenerated,
      summary: detection.summary,
      resultPayload: detection.resultPayload,
      detectionProvider: detection.providerId
    });

    console.info(
      `${logPrefix} completed scan=${scanId} provider=${detection.providerId} confidence=${detection.confidence} ai=${detection.isAiGenerated}`
    );
    return { ok: true, scanId, confidence: detection.confidence };
  } finally {
    if (resolved) {
      await resolved.release();
    }
  }
}

module.exports = {
  processScanById,
  markProcessing,
  markCompleted,
  markFailed,
  LOG
};
