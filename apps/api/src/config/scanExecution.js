"use strict";

/**
 * How scan jobs run after a row is created.
 * - `queue` — enqueue BullMQ job (requires Redis + worker).
 * - `direct` — run the same pipeline inside the API process (temporary; no worker).
 */
function getScanExecutionMode() {
  const raw = (process.env.SCAN_EXECUTION_MODE || "queue").trim().toLowerCase();
  if (raw === "direct") {
    return "direct";
  }
  return "queue";
}

module.exports = {
  getScanExecutionMode
};
