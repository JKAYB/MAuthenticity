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
const {
  resolveArtifactAggregationStorageKey,
  resolveArtifactModelMetadataStorageKey,
  assertArtifactKeyScopedToScan
} = require("./scanDetailArtifact.service");

const SCAN_SELECT_FIELDS = `id, user_id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
            result_payload, error_message, summary, source_type, source_url, storage_key, storage_provider, detection_provider,
            created_at, updated_at, completed_at`;

/** Max bytes allowed for scan media preview (full or ranged). */
const MAX_MEDIA_PREVIEW_BYTES = 25 * 1024 * 1024;

const queuePayload = (scanId, userId) => ({ scanId, userId });

const defaultJobOpts = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  }
};

let loggedExecutionMode = false;

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

/**
 * After row insert: enqueue or run inline based on SCAN_EXECUTION_MODE.
 * @returns {Promise<{ id: string; status: string }>}
 */
async function dispatchScanAfterInsert({ scanId, userId }) {
  logExecutionModeOnce();
  const mode = getScanExecutionMode();

  if (mode === "direct") {
    assertObjectStorageReadyForDirect();
    console.info(`[scan-api] direct processing start scan=${scanId} user=${userId}`);
    try {
      await processScanById({
        pool,
        scanId,
        userId,
        logPrefix: "[scan-api-direct]"
      });
      console.info(`[scan-api] direct processing completed scan=${scanId}`);
      return { id: scanId, status: "completed" };
    } catch (err) {
      const msg = err && err.message ? err.message : "Scan processing failed";
      await markFailed(pool, { scanId, errorMessage: msg });
      console.error(`[scan-api] direct processing failed scan=${scanId}: ${msg}`);
      return { id: scanId, status: "failed" };
    }
  }

  const { scanQueue } = require("../queues/scan.queue");
  await scanQueue.add("scan-media", queuePayload(scanId, userId), {
    jobId: scanId,
    ...defaultJobOpts
  });
  console.info(`[scan-api] queue job added scan=${scanId} user=${userId} queue=scan-jobs`);
  return { id: scanId, status: "pending" };
}

async function createScanFromUpload({ userId, file }) {
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

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                        source_type, storage_key, storage_provider, source_url)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'upload', $6, $7, NULL)`,
    [scanId, userId, file.originalname, file.mimetype, file.size, saved.storageKey, saved.storageProvider]
  );

  console.info(`[scan-api] scan row created scan=${scanId} user=${userId} source=upload`);

  return dispatchScanAfterInsert({ scanId, userId });
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

async function createScanFromUrl({ userId, url }) {
  const scanId = uuidv4();
  const filename = filenameFromUrl(url);

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                        source_type, storage_key, storage_provider, source_url)
     VALUES ($1, $2, $3, 'application/octet-stream', 0, 'pending', 'url', NULL, NULL, $4)`,
    [scanId, userId, filename, url]
  );

  console.info(`[scan-api] scan row created scan=${scanId} user=${userId} source=url`);

  return dispatchScanAfterInsert({ scanId, userId });
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

async function getScanHistory({ userId, page, limit }) {
  const offset = (page - 1) * limit;
  const [{ rows: dataRows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT ${SCAN_SELECT_FIELDS}
       FROM scans
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    pool.query("SELECT COUNT(*)::INT AS total FROM scans WHERE user_id = $1", [userId])
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

module.exports = {
  createScanFromUpload,
  createScanFromUrl,
  getScanById,
  getScanHistory,
  getScanMediaForUser,
  getScanHeatmapAssetForUser,
  getScanArtifactForUser
};
