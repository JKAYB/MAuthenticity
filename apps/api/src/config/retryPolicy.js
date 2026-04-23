"use strict";

const MAX_RETRIES = Number.parseInt(process.env.SCAN_MAX_RETRIES || "5", 10);
const RETRY_LIMIT_ENFORCED = String(process.env.SCAN_RETRY_LIMIT_ENFORCED || "")
  .trim()
  .toLowerCase() === "true";

function retryCountFromScan(scan) {
  const raw = scan && scan.retry_count;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function canRetry(scan) {
  const retryCount = retryCountFromScan(scan);
  if (!RETRY_LIMIT_ENFORCED) {
    return { ok: true, retryCount, maxRetries: MAX_RETRIES, enforced: false };
  }
  if (retryCount >= MAX_RETRIES) {
    return { ok: false, retryCount, maxRetries: MAX_RETRIES, enforced: true, reason: "Retry limit reached" };
  }
  return { ok: true, retryCount, maxRetries: MAX_RETRIES, enforced: true };
}

const retryPolicy = { canRetry };

module.exports = { MAX_RETRIES, RETRY_LIMIT_ENFORCED, retryPolicy };
