const path = require("path");
const { v4: uuidv4 } = require("uuid");
const {
  getScanObjectStorage,
  getStorageForProvider,
  describeObjectStorageReadiness
} = require("@media-auth/scan-storage");
const { processScanById, markFailed } = require("@media-auth/worker/process-scan");
const { pool } = require("../db/pool");
const { getScanExecutionMode } = require("../config/scanExecution");
const { parseBytesRange } = require("../utils/scanMediaRange.util");
const { findHeatmapAssetRef } = require("./scanDetailHeatmap.service");
const { MEDIA_TYPE_SQL } = require("../utils/mediaType.util");
const { resolveProviderIdsForScan } = require("../config/scanProviders");
const {
  resolveArtifactAggregationStorageKey,
  resolveArtifactModelMetadataStorageKey,
  assertArtifactKeyScopedToScan
} = require("./scanDetailArtifact.service");

const SCAN_SELECT_FIELDS = `id, user_id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
            result_payload, error_message, summary, source_type, source_url, storage_key, storage_provider, detection_provider,
            selected_providers, failed_providers, error_payload, provider_statuses, is_retry, scan_group_id, retry_of_scan_id, attempt_number, retry_count, last_error,
            created_at, updated_at, completed_at, (${MEDIA_TYPE_SQL}) AS media_type`;

/** Max bytes allowed for scan media preview (full or ranged). */
const MAX_MEDIA_PREVIEW_BYTES = 25 * 1024 * 1024;
const MEDIA_TYPE_SQL_FOR_SCAN_ALIAS = MEDIA_TYPE_SQL.replace(/\bmime_type\b/g, "s.mime_type");

const queuePayload = (scanId, userId) => ({ scanId, userId });

const defaultJobOpts = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  }
};

let loggedExecutionMode = false;
const URL_RETRY_HEAD_TIMEOUT_MS = 5000;

function toQueuedProviderExecution(providerIds) {
  const ids = Array.isArray(providerIds) ? providerIds : [];
  return ids
    .map((id) => String(id || "").trim().toLowerCase())
    .filter(Boolean)
    .map((id) => ({ id, status: "queued" }));
}

function logExecutionModeOnce() {
  if (loggedExecutionMode) {
    return;
  }
  loggedExecutionMode = true;
  const mode = getScanExecutionMode();
  console.info(
    `[scan-api] SCAN_EXECUTION_MODE=${mode} (${mode === "direct" ? "inline in API" : "BullMQ scan-jobs + worker"})`
  );
}

function assertObjectStorageReadyForDirect() {
  const os = describeObjectStorageReadiness();
  if (!os.ok) {
    throw new Error(`Object storage not configured for direct scan mode: ${os.issues.join("; ")}`);
  }
}

async function storageObjectExists(storage, storageKey) {
  if (typeof storage.exists === "function") {
    return Boolean(await storage.exists(storageKey));
  }
  const info = await storage.getObjectInfo(storageKey);
  return Boolean(info && info.exists);
}

async function canReachSourceUrl(sourceUrl) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), URL_RETRY_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, {
      method: "HEAD",
      signal: ac.signal,
      redirect: "follow"
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * After row insert: enqueue or kick off direct processing in background.
 * @returns {Promise<void>}
 */
async function dispatchScanAfterInsert({ scanId, userId }) {
  logExecutionModeOnce();
  const mode = getScanExecutionMode();

  if (mode === "direct") {
    assertObjectStorageReadyForDirect();
    console.info(`[scan-api] direct processing queued scan=${scanId} user=${userId}`);
    setImmediate(async () => {
      try {
        await processScanById({
          pool,
          scanId,
          userId,
          logPrefix: "[scan-api-direct]"
        });
        console.info(`[scan-api] direct processing completed scan=${scanId}`);
      } catch (err) {
        const msg = err && err.message ? err.message : "Scan processing failed";
        const failedProviders = Array.isArray(err && err.failedProviders) ? err.failedProviders : [];
        const errorPayload = Array.isArray(err && err.failedProviderPayload) ? err.failedProviderPayload : null;
        try {
          await markFailed(pool, { scanId, errorMessage: msg, failedProviders, errorPayload });
        } catch (markErr) {
          const markMsg = markErr && markErr.message ? markErr.message : "unknown";
          console.error(`[scan-api] markFailed errored scan=${scanId}: ${markMsg}`);
        }
        console.error(`[scan-api] direct processing failed scan=${scanId}: ${msg}`);
      }
    });
    return;
  }

  const { scanQueue } = require("../queues/scan.queue");
  await scanQueue.add("scan-media", queuePayload(scanId, userId), {
    jobId: scanId,
    ...defaultJobOpts
  });
  console.info(`[scan-api] queue job added scan=${scanId} user=${userId} queue=scan-jobs`);
}

async function createScanFromUpload({ userId, file, requestedProviderIds }) {
  const scanId = uuidv4();
  const buffer = file.buffer;
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Upload buffer missing (memory storage required)");
  }

  const storage = getScanObjectStorage();
  const saved = await storage.saveUpload({
    userId,
    scanId,
    buffer,
    originalName: file.originalname,
    contentType: file.mimetype
  });

  const providerResolution = resolveProviderIdsForScan({
    requestedIds: requestedProviderIds,
    mimeType: file.mimetype,
    sourceType: "upload"
  });
  if (!providerResolution.ok) {
    const err = new Error(providerResolution.error);
    err.status = 400;
    throw err;
  }

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                        source_type, storage_key, storage_provider, source_url, selected_providers,
                        scan_group_id, retry_of_scan_id, attempt_number, retry_count, last_error, is_retry, provider_statuses)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'upload', $6, $7, NULL, $8::text[], $1, NULL, 1, 0, NULL, FALSE, '{}'::jsonb)`,
    [
      scanId,
      userId,
      file.originalname,
      file.mimetype,
      file.size,
      saved.storageKey,
      saved.storageProvider,
      providerResolution.providerIds
    ]
  );

  console.info(`[scan-api] scan row created scan=${scanId} user=${userId} source=upload`);

  await dispatchScanAfterInsert({ scanId, userId });
  return {
    ok: true,
    scan: {
      id: scanId,
      status: "pending",
      providerExecution: toQueuedProviderExecution(providerResolution.providerIds)
    },
    id: scanId,
    status: "pending"
  };
}

function filenameFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const base = path.basename(u.pathname);
    const trimmed = (base || "remote-media").slice(0, 200);
    return trimmed || "remote-media";
  } catch {
    return "remote-media";
  }
}

async function createScanFromUrl({ userId, url, requestedProviderIds }) {
  const scanId = uuidv4();
  const filename = filenameFromUrl(url);
  const providerResolution = resolveProviderIdsForScan({
    requestedIds: requestedProviderIds,
    mimeType: "application/octet-stream",
    sourceType: "url"
  });
  if (!providerResolution.ok) {
    const err = new Error(providerResolution.error);
    err.status = 400;
    throw err;
  }

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                        source_type, storage_key, storage_provider, source_url, selected_providers,
                        scan_group_id, retry_of_scan_id, attempt_number, retry_count, last_error, is_retry, provider_statuses)
     VALUES ($1, $2, $3, 'application/octet-stream', 0, 'pending', 'url', NULL, NULL, $4, $5::text[], $1, NULL, 1, 0, NULL, FALSE, '{}'::jsonb)`,
    [scanId, userId, filename, url, providerResolution.providerIds]
  );

  console.info(`[scan-api] scan row created scan=${scanId} user=${userId} source=url`);

  await dispatchScanAfterInsert({ scanId, userId });
  return {
    ok: true,
    scan: {
      id: scanId,
      status: "pending",
      providerExecution: toQueuedProviderExecution(providerResolution.providerIds)
    },
    id: scanId,
    status: "pending"
  };
}

async function getScanById({ scanId, userId }) {
  const { rows } = await pool.query(
    `SELECT ${SCAN_SELECT_FIELDS}
     FROM scans
     WHERE id = $1 AND user_id = $2`,
    [scanId, userId]
  );

  return rows[0] || null;
}

async function getScanAttemptsByGroup({ userId, scanGroupId }) {
  const { rows } = await pool.query(
    `SELECT ${SCAN_SELECT_FIELDS}
     FROM scans
     WHERE user_id = $1 AND scan_group_id = $2
     ORDER BY attempt_number ASC, created_at ASC`,
    [userId, scanGroupId]
  );
  return rows;
}

async function retryFailedScanForUser({ scanId, userId, retryProviders }) {
  const base = await getScanById({ scanId, userId });
  if (!base) {
    return { ok: false, reason: "not_found", message: "Scan not found" };
  }
  if (String(base.status || "").toLowerCase() !== "failed") {
    return { ok: false, reason: "not_retryable", message: "Only failed scans can be retried" };
  }
  if (Array.isArray(retryProviders) && retryProviders.length > 0) {
    console.info(
      `[scan-api] retry provider override requested scan=${scanId} retry_providers=${retryProviders.join(",")} (not yet supported)`
    );
  }

  const sourceType = String(base.source_type || "upload").toLowerCase();
  if (sourceType === "upload") {
    const key = base.storage_key ? String(base.storage_key).trim() : "";
    if (!key) {
      console.info(`[scan-api] retry media check scan=${scanId} storage_key=(missing) exists=false`);
      return { ok: false, reason: "no_media", message: "Stored media is missing for this scan" };
    }
    try {
      const provider = base.storage_provider ? String(base.storage_provider).trim().toLowerCase() : "local";
      const storage = getStorageForProvider(provider);
      const exists = await storageObjectExists(storage, key);
      console.info(`[scan-api] retry media check scan=${scanId} storage_key=${key} exists=${exists}`);
      if (!exists) {
        return {
          ok: false,
          reason: "no_media",
          message: "Original file no longer available for retry"
        };
      }
    } catch (error) {
      console.error(
        `[scan-api] retry media check scan=${scanId} storage_key=${key} exists=error message=${
          error && error.message ? String(error.message) : "unknown"
        }`
      );
      return {
        ok: false,
        reason: "no_media",
        message: "Original file no longer available for retry"
      };
    }
  } else {
    const sourceUrl = base.source_url ? String(base.source_url).trim() : "";
    if (!sourceUrl) {
      console.info(`[scan-api] retry media check scan=${scanId} source_url=(missing) reachable=false`);
      return { ok: false, reason: "no_media", message: "Source URL is missing for this scan" };
    }
    const reachable = await canReachSourceUrl(sourceUrl);
    console.info(`[scan-api] retry media check scan=${scanId} source_url=${sourceUrl} reachable=${reachable}`);
    if (!reachable) {
      return {
        ok: false,
        reason: "no_media",
        message: "Original source URL is no longer accessible for retry"
      };
    }
  }

  const groupId = base.scan_group_id ? String(base.scan_group_id) : String(base.id);
  const { rows: attemptRows } = await pool.query(
    `SELECT COALESCE(MAX(attempt_number), 1) AS max_attempt
     FROM scans
     WHERE user_id = $1 AND scan_group_id = $2`,
    [userId, groupId]
  );
  const maxAttempt = Number(attemptRows[0] && attemptRows[0].max_attempt ? attemptRows[0].max_attempt : 1);
  const nextAttempt = Number.isFinite(maxAttempt) ? maxAttempt + 1 : 2;
  const baseRetryCount = Number.isFinite(Number(base.retry_count)) ? Number(base.retry_count) : 0;
  const nextRetryCount = Math.max(0, baseRetryCount + 1);

  const newScanId = uuidv4();
  const selectedProviders = Array.isArray(base.selected_providers)
    ? base.selected_providers.filter((id) => typeof id === "string" && id.trim())
    : [];
  if (selectedProviders.length === 0) {
    console.info(`[scan-api] retry provider snapshot scan=${scanId} selected_providers=[] valid=false`);
    return {
      ok: false,
      reason: "not_retryable",
      message: "Original scan has no provider snapshot for retry"
    };
  }
  console.info(
    `[scan-api] retry provider snapshot scan=${scanId} selected_providers=${selectedProviders.join(",")} valid=true`
  );

  await pool.query(
    `INSERT INTO scans (
      id, user_id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
      result_payload, error_message, summary, source_type, source_url, storage_key, storage_provider,
      detection_provider, selected_providers, scan_group_id, retry_of_scan_id, attempt_number, retry_count,
      last_error, error_payload, is_retry, provider_statuses, created_at, updated_at, completed_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'pending', NULL, NULL,
      NULL, NULL, NULL, $6, $7, $8, $9,
      NULL, $10::text[], $11, $12, $13, $14,
      NULL, NULL, TRUE, '{}'::jsonb, NOW(), NOW(), NULL
    )`,
    [
      newScanId,
      userId,
      base.filename,
      base.mime_type || "application/octet-stream",
      base.file_size_bytes || 0,
      sourceType,
      base.source_url || null,
      base.storage_key || null,
      base.storage_provider || null,
      selectedProviders,
      groupId,
      base.id,
      nextAttempt,
      nextRetryCount
    ]
  );

  await dispatchScanAfterInsert({ scanId: newScanId, userId });
  return {
    ok: true,
    scan: {
      id: newScanId,
      status: "pending",
      retry_of_scan_id: base.id,
      scan_group_id: groupId,
      attempt_number: nextAttempt,
      retry_count: nextRetryCount
    }
  };
}

/**
 * Stream persisted upload bytes for the scan owner (HTTP Range supported).
 * @param {{ scanId: string; userId: string; rangeHeader?: string | undefined }} params
 */
async function getScanMediaForUser({ scanId, userId, rangeHeader }) {
  const row = await getScanById({ scanId, userId });
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  const sourceType = row.source_type ? String(row.source_type).trim().toLowerCase() : "upload";
  const storageKey = row.storage_key && String(row.storage_key).trim();
  if (sourceType !== "upload" || !storageKey) {
    return { ok: false, reason: "no_media" };
  }

  const dbSizeRaw = row.file_size_bytes;
  const dbNum =
    dbSizeRaw != null && Number.isFinite(Number(dbSizeRaw)) ? Math.trunc(Number(dbSizeRaw)) : null;
  if (dbNum != null && dbNum > MAX_MEDIA_PREVIEW_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  const provider = row.storage_provider ? String(row.storage_provider).trim().toLowerCase() : "local";
  const mimeType =
    row.mime_type && String(row.mime_type).trim() ? String(row.mime_type).trim() : "application/octet-stream";
  const filename = row.filename && String(row.filename).trim() ? String(row.filename).trim() : "upload";

  try {
    const storage = getStorageForProvider(provider);
    const info = await storage.getObjectInfo(storageKey);
    if (!info.exists) {
      return { ok: false, reason: "no_media" };
    }
    const objectSize =
      info.size != null && Number.isFinite(Number(info.size)) ? Math.trunc(Number(info.size)) : 0;
    if (objectSize > MAX_MEDIA_PREVIEW_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    let totalSize = objectSize;
    if (!totalSize && dbNum != null && dbNum > 0) {
      totalSize = dbNum;
    }
    if (!totalSize) {
      return { ok: false, reason: "stream_error", message: "Could not determine media size" };
    }

    const parsed = parseBytesRange(rangeHeader, totalSize);
    if (parsed.kind === "unsatisfiable") {
      return { ok: false, reason: "range_not_satisfiable", totalSize };
    }

    let httpStatus = 200;
    let rangeStart = 0;
    let rangeEnd = totalSize - 1;
    /** @type {{ start: number; end: number } | undefined} */
    let byteRange;
    if (parsed.kind === "partial") {
      httpStatus = 206;
      rangeStart = parsed.start;
      rangeEnd = parsed.end;
      byteRange = { start: rangeStart, end: rangeEnd };
    }

    const stream = await storage.getDownloadStream(storageKey, byteRange);
    const contentLength = rangeEnd - rangeStart + 1;
    return {
      ok: true,
      stream,
      mimeType,
      filename,
      totalSize,
      httpStatus,
      contentLength,
      rangeStart,
      rangeEnd,
      isPartial: httpStatus === 206
    };
  } catch (e) {
    const message = e && e.message ? String(e.message) : "Failed to read media";
    return { ok: false, reason: "stream_error", message };
  }
}

/**
 * Stream a persisted heatmap object (structured `derived/` key) for the scan owner.
 * @param {{ scanId: string; userId: string; assetName: string }} params
 */
async function getScanHeatmapAssetForUser({ scanId, userId, assetName }) {
  const row = await getScanById({ scanId, userId });
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  const ref = findHeatmapAssetRef(row.result_payload, assetName);
  if (!ref) {
    return { ok: false, reason: "not_found" };
  }

  const provider = row.storage_provider ? String(row.storage_provider).trim().toLowerCase() : "local";
  const mimeType = ref.mimeType || "image/png";

  try {
    const storage = getStorageForProvider(provider);
    const info = await storage.getObjectInfo(ref.storageKey);
    if (!info.exists) {
      return { ok: false, reason: "no_media" };
    }
    const objectSize =
      info.size != null && Number.isFinite(Number(info.size)) ? Math.trunc(Number(info.size)) : 0;
    if (!objectSize) {
      return { ok: false, reason: "stream_error", message: "Could not determine heatmap size" };
    }

    const stream = await storage.getDownloadStream(ref.storageKey);
    return {
      ok: true,
      stream,
      mimeType,
      contentLength: objectSize
    };
  } catch (e) {
    const message = e && e.message ? String(e.message) : "Failed to read heatmap";
    return { ok: false, reason: "stream_error", message };
  }
}

const ARTIFACT_TYPES = new Set(["aggregation", "model-metadata"]);

/**
 * Stream detection artifact bytes (JSON) for the scan owner.
 * @param {{ scanId: string; userId: string; type: string }} params
 */
async function getScanArtifactForUser({ scanId, userId, type }) {
  const row = await getScanById({ scanId, userId });
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  const t = String(type || "")
    .trim()
    .toLowerCase();
  if (!ARTIFACT_TYPES.has(t)) {
    return { ok: false, reason: "bad_type" };
  }

  const payload = row.result_payload;
  const storageKey =
    t === "aggregation"
      ? resolveArtifactAggregationStorageKey(payload)
      : resolveArtifactModelMetadataStorageKey(payload);

  const ownerId = row.user_id != null ? String(row.user_id) : "";
  if (!storageKey || !assertArtifactKeyScopedToScan(storageKey, ownerId, scanId)) {
    return { ok: false, reason: "not_found" };
  }

  const provider = row.storage_provider ? String(row.storage_provider).trim().toLowerCase() : "local";
  const mimeType = "application/json";
  const downloadName = t === "aggregation" ? "aggregation.json" : "model-metadata.json";

  try {
    const storage = getStorageForProvider(provider);
    const info = await storage.getObjectInfo(storageKey);
    if (!info.exists) {
      return { ok: false, reason: "no_media" };
    }
    const objectSize =
      info.size != null && Number.isFinite(Number(info.size)) ? Math.trunc(Number(info.size)) : 0;
    if (!objectSize) {
      return { ok: false, reason: "stream_error", message: "Could not determine artifact size" };
    }

    const stream = await storage.getDownloadStream(storageKey);
    return {
      ok: true,
      stream,
      mimeType,
      contentLength: objectSize,
      downloadName
    };
  } catch (e) {
    const message = e && e.message ? String(e.message) : "Failed to read artifact";
    return { ok: false, reason: "stream_error", message };
  }
}

async function getScanHistory({ userId, page, limit, mediaType }) {
  const offset = (page - 1) * limit;
  const where = ["s.user_id = $1"];
  /** @type {unknown[]} */
  const params = [userId];
  if (mediaType) {
    where.push(`(${MEDIA_TYPE_SQL_FOR_SCAN_ALIAS}) = $2`);
    params.push(mediaType);
  }
  const whereSql = where.join(" AND ");
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;
  const [{ rows: dataRows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT ${SCAN_SELECT_FIELDS}
       FROM (
         SELECT s.*, ROW_NUMBER() OVER (
           PARTITION BY s.scan_group_id
           ORDER BY s.created_at DESC
         ) AS rn
         FROM scans s
         WHERE ${whereSql}
       ) latest
       WHERE latest.rn = 1
       ORDER BY latest.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM (
         SELECT 1
         FROM scans s
         WHERE ${whereSql}
         GROUP BY s.scan_group_id
       ) grouped`,
      params
    )
  ]);

  const total = countRows[0] ? countRows[0].total : 0;
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data: dataRows
  };
}

async function getBillableScanCountForUser({ userId }) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::INT AS total
     FROM scans
     WHERE user_id = $1
       AND is_retry = FALSE`,
    [userId]
  );
  // retries should not consume user quota
  return rows[0] ? Number(rows[0].total) : 0;
}

module.exports = {
  createScanFromUpload,
  createScanFromUrl,
  getScanById,
  getScanHistory,
  getBillableScanCountForUser,
  getScanAttemptsByGroup,
  retryFailedScanForUser,
  getScanMediaForUser,
  getScanHeatmapAssetForUser,
  getScanArtifactForUser
};
