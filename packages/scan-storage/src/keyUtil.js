const path = require("path");

/**
 * @param {string} name
 */
function safeOriginalSegment(name) {
  const base = path.basename(String(name || "upload")).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return base || "file.bin";
}

/**
 * @param {{ scanId: string; originalName: string; prefix?: string }} params
 * @returns {{ objectKey: string; segment: string }}
 */
function buildObjectKey({ scanId, originalName, prefix = "" }) {
  const segment = safeOriginalSegment(originalName);
  const p = prefix && prefix.trim() ? prefix.replace(/\/?$/, "/") : "";
  const objectKey = `${p}${scanId}/${segment}`;
  return { objectKey, segment };
}

module.exports = { safeOriginalSegment, buildObjectKey };
