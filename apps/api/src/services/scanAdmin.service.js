const { pool } = require("../db/pool");

/** Lazy: avoid opening Redis/BullMQ at API boot when using SCAN_EXECUTION_MODE=direct. */
function getScanQueue() {
  return require("../queues/scan.queue").scanQueue;
}

const ADMIN_SCAN_FIELDS = `s.id, s.user_id, u.email AS user_email, s.filename, s.mime_type, s.file_size_bytes,
  s.status, s.confidence, s.is_ai_generated, s.result_payload, s.error_message, s.summary,
  s.source_type, s.source_url, s.storage_key, s.storage_provider, s.detection_provider,
  s.created_at, s.updated_at, s.completed_at, s.retry_count`;

const defaultJobOpts = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  }
};

function queuePayload(scanId, userId) {
  return { scanId, userId };
}

async function removeQueueJobIfPresent(jobId) {
  const job = await getScanQueue().getJob(jobId);
  if (job) {
    await job.remove({ removeChildren: true });
  }
}

/**
 * @param {string} scanId
 * @param {string} userId
 */
async function enqueueScanJob(scanId, userId) {
  await getScanQueue().add("scan-media", queuePayload(scanId, userId), {
    jobId: scanId,
    ...defaultJobOpts
  });
}

async function loadScanForAdmin(scanId) {
  const { rows } = await pool.query(
    `SELECT ${ADMIN_SCAN_FIELDS}
     FROM scans s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [scanId]
  );
  return rows[0] || null;
}

async function getScanAdmin(scanId) {
  return loadScanForAdmin(scanId);
}

async function listScansAdmin({
  status,
  detectionProvider,
  createdAfter,
  createdBefore,
  limit,
  offset
}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const where = [];
  const params = [];
  let i = 1;

  if (status) {
    where.push(`s.status = $${i++}`);
    params.push(status);
  }
  if (detectionProvider) {
    where.push(`s.detection_provider = $${i++}`);
    params.push(detectionProvider);
  }
  if (createdAfter) {
    where.push(`s.created_at >= $${i++}`);
    params.push(createdAfter);
  }
  if (createdBefore) {
    where.push(`s.created_at <= $${i++}`);
    params.push(createdBefore);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countSql = `SELECT COUNT(*)::INT AS total FROM scans s ${clause}`;
  const listSql = `SELECT ${ADMIN_SCAN_FIELDS}
    FROM scans s
    LEFT JOIN users u ON u.id = s.user_id
    ${clause}
    ORDER BY s.created_at DESC
    LIMIT $${i} OFFSET $${i + 1}`;

  const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
    pool.query(countSql, params),
    pool.query(listSql, [...params, lim, off])
  ]);

  return {
    data: dataRows,
    limit: lim,
    offset: off,
    total: countRows[0] ? countRows[0].total : 0
  };
}

async function listStuckProcessingAdmin({ staleMinutes, limit }) {
  const minutes = Math.max(1, Math.min(Number(staleMinutes) || 15, 24 * 60));
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const { rows } = await pool.query(
    `SELECT ${ADMIN_SCAN_FIELDS}
     FROM scans s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.status = 'processing'
       AND s.completed_at IS NULL
       AND s.updated_at < NOW() - ($1::int * INTERVAL '1 minute')
     ORDER BY s.updated_at ASC
     LIMIT $2`,
    [minutes, lim]
  );

  return {
    data: rows,
    staleMinutes: minutes,
    limit: lim
  };
}

async function countsByStatusAdmin() {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::INT AS count
     FROM scans
     GROUP BY status
     ORDER BY status ASC`
  );
  const byStatus = {};
  for (const r of rows) {
    byStatus[r.status] = r.count;
  }
  return { byStatus, rows };
}

/**
 * @param {import('bullmq').Job | undefined} job
 */
async function assertJobNotActivelyRunning(job) {
  if (!job) {
    return { ok: true };
  }
  const state = await job.getState();
  if (state === "active") {
    return { ok: false, code: "job_active", message: "Queue job is still active; refuse to reset while worker may be running" };
  }
  return { ok: true, job, state };
}

async function resetScanRowForRequeue(scanId) {
  await pool.query(
    `UPDATE scans
     SET status = 'pending',
         error_message = NULL,
         summary = NULL,
         result_payload = NULL,
         confidence = NULL,
         is_ai_generated = NULL,
         detection_provider = NULL,
         completed_at = NULL,
         updated_at = NOW(),
         retry_count = retry_count + 1
     WHERE id = $1`,
    [scanId]
  );
}

/**
 * Retry a failed (or optionally completed) scan: clear outcome fields, re-enqueue with same job id.
 * @param {object} opts
 * @param {boolean} [opts.allowCompleted]
 */
async function retryScanAdmin(scanId, opts = {}) {
  const { allowCompleted = false } = opts;
  const row = await loadScanForAdmin(scanId);
  if (!row) {
    const err = new Error("Scan not found");
    err.status = 404;
    throw err;
  }
  if (!row.user_id) {
    const err = new Error("Scan has no user_id; cannot re-enqueue");
    err.status = 409;
    throw err;
  }

  if (row.status === "processing") {
    const err = new Error("Scan is processing; retry is not allowed");
    err.status = 409;
    throw err;
  }
  if (row.status === "pending") {
    const err = new Error("Scan is already pending; use reset-stuck if processing is stale");
    err.status = 409;
    throw err;
  }
  if (row.status === "completed" && !allowCompleted) {
    const err = new Error("Scan is completed; pass allow_completed=1 to retry anyway");
    err.status = 409;
    throw err;
  }

  const job = await getScanQueue().getJob(scanId);
  const gate = await assertJobNotActivelyRunning(job);
  if (!gate.ok) {
    const err = new Error(gate.message);
    err.status = 409;
    throw err;
  }

  await removeQueueJobIfPresent(scanId);
  await resetScanRowForRequeue(scanId);
  await enqueueScanJob(scanId, row.user_id);

  return loadScanForAdmin(scanId);
}

/**
 * Mark a stale `processing` scan as pending and re-enqueue. Requires row older than threshold and no active queue job.
 * @param {object} opts
 * @param {number} [opts.staleMinutes]
 */
async function resetStuckProcessingScanAdmin(scanId, opts = {}) {
  const staleMinutes = Math.max(1, Math.min(Number(opts.staleMinutes) || 15, 24 * 60));

  const { rows } = await pool.query(
    `SELECT ${ADMIN_SCAN_FIELDS}
     FROM scans s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = $1
       AND s.status = 'processing'
       AND s.completed_at IS NULL
       AND s.updated_at < NOW() - ($2::int * INTERVAL '1 minute')`,
    [scanId, staleMinutes]
  );
  const row = rows[0];
  if (!row) {
    const err = new Error("Scan not found or not eligible (must be processing, incomplete, and stale by updated_at)");
    err.status = 404;
    throw err;
  }
  if (!row.user_id) {
    const err = new Error("Scan has no user_id; cannot re-enqueue");
    err.status = 409;
    throw err;
  }

  const job = await getScanQueue().getJob(scanId);
  const gate = await assertJobNotActivelyRunning(job);
  if (!gate.ok) {
    const err = new Error(gate.message);
    err.status = 409;
    throw err;
  }

  await removeQueueJobIfPresent(scanId);
  await resetScanRowForRequeue(scanId);
  await enqueueScanJob(scanId, row.user_id);

  return loadScanForAdmin(scanId);
}

module.exports = {
  getScanAdmin,
  listScansAdmin,
  listStuckProcessingAdmin,
  countsByStatusAdmin,
  retryScanAdmin,
  resetStuckProcessingScanAdmin
};
