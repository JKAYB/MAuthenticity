const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { getScanObjectStorage, describeObjectStorageReadiness } = require("@media-auth/scan-storage");
const { processScanById, markFailed } = require("@media-auth/worker/process-scan");
const { pool } = require("../db/pool");
const { getScanExecutionMode } = require("../config/scanExecution");

const SCAN_SELECT_FIELDS = `id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
            result_payload, error_message, summary, source_type, source_url, storage_key, storage_provider, detection_provider,
            created_at, updated_at, completed_at`;

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
  getScanHistory
};
