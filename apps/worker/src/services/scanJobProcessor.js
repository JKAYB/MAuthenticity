const { UnrecoverableError } = require("bullmq");
const { pool } = require("../db/pool");
const { processScanById, markFailed, LOG: PROCESS_LOG } = require("./processScan");

const LOG = "[scan-worker]";

function maxAttemptsFor(job) {
  const n = job.opts.attempts;
  return typeof n === "number" && n > 0 ? n : 1;
}

function willRetryAfterFailure(job) {
  return job.attemptsMade + 1 < maxAttemptsFor(job);
}

/**
 * @param {import('bullmq').Job} job
 */
async function processScanJob(job) {
  const { scanId, userId } = job.data;
  if (!scanId) {
    throw new UnrecoverableError("Job payload missing scanId");
  }

  console.info(
    `${LOG} start job=${job.id} scan=${scanId} attempt=${job.attemptsMade + 1}/${maxAttemptsFor(job)}`
  );

  const result = await processScanById({
    pool,
    scanId,
    userId,
    logPrefix: `${PROCESS_LOG} job=${job.id}`
  });

  if (result.skipped) {
    console.info(`${LOG} skip job=${job.id} scan=${scanId} (already completed)`);
  }

  return result;
}

async function handleProcessorError(job, error) {
  const { scanId } = job.data || {};
  const message = error && error.message ? error.message : "Unexpected worker error";
  const max = maxAttemptsFor(job);

  if (error instanceof UnrecoverableError || error.name === "UnrecoverableError") {
    if (scanId) {
      await markFailed(pool, { scanId, errorMessage: message });
    }
    const code = error && error.code ? String(error.code) : "";
    console.error(
      `${LOG} unrecoverable job=${job.id} scan=${scanId || "?"}${code ? ` code=${code}` : ""}: ${message}`
    );
    return;
  }

  if (willRetryAfterFailure(job)) {
    const code = error && error.code ? String(error.code) : "";
    console.warn(
      `${LOG} transient failure job=${job.id} scan=${scanId || "?"} attempt=${job.attemptsMade + 1}/${max}${
        code ? ` code=${code}` : ""
      }: ${message}`
    );
    return;
  }

  if (scanId) {
    await markFailed(pool, { scanId, errorMessage: message });
  }
  const code = error && error.code ? String(error.code) : "";
  console.error(
    `${LOG} failed permanently job=${job.id} scan=${scanId || "?"}${code ? ` code=${code}` : ""}: ${message}`
  );
}

module.exports = {
  processScanJob,
  handleProcessorError
};
