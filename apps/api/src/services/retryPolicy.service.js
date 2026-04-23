"use strict";

/**
 * Retry policy service for plan-aware retry controls.
 * Current behavior: always allow retries.
 * Future behavior:
 * - free plan: limited retries
 * - paid plans: unlimited or higher limits
 * - org plans: extended limits and policy overrides
 */
function canRetry(user, scan) {
  const plan = String((user && user.plan) || "free").trim().toLowerCase();
  const retryCount = Number.isFinite(Number(scan && scan.retry_count))
    ? Number(scan.retry_count)
    : 0;

  // Future policy branches (intentionally non-blocking for now).
  if (plan === "free") {
    return { ok: true, reason: null, policy: "free", retryCount };
  }
  if (plan === "organization" || plan === "org") {
    return { ok: true, reason: null, policy: "organization", retryCount };
  }
  return { ok: true, reason: null, policy: "paid", retryCount };
}

module.exports = { canRetry };
