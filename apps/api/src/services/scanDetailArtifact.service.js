"use strict";

/**
 * Scan artifacts (Reality Defender aggregation + model metadata JSON).
 *
 * - RD historically exposed `aggregationResultUrl` / `modelMetadataUrl` as either vendor HTTPS URLs or,
 *   for aggregation, an internal **storage key** string — neither is safe to hand to the browser as `<a href>`.
 * - Worker `persistRdArtifacts` normalizes to `artifactAggregationStorageKey` / `artifactModelMetadataStorageKey`
 *   (both MediaAuth-owned object keys) before DB write.
 * - GET `/scan/:id` clones `result_payload`, computes availability, then **strips** keys/legacy URL fields from JSON.
 * - Bytes are served only via authenticated GET `/scan/:id/artifacts/:type`.
 */

/**
 * @param {unknown} payload
 * @returns {Record<string, unknown> | null}
 */
function getRealProcessorBlock(payload) {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!p) {
    return null;
  }
  const real =
    p.processors && typeof p.processors === "object" && !Array.isArray(p.processors)
      ? p.processors.reality_defender || p.processors.real
      : null;
  return real && typeof real === "object" && !Array.isArray(real) ? /** @type {Record<string, unknown>} */ (real) : null;
}

/**
 * @param {string} s
 */
function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

/**
 * @param {unknown} resultPayload
 * @returns {string | null}
 */
function resolveArtifactAggregationStorageKey(resultPayload) {
  const real = getRealProcessorBlock(resultPayload);
  if (!real) {
    return null;
  }
  const direct = real.artifactAggregationStorageKey;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const leg = real.aggregationResultUrl;
  if (typeof leg === "string" && leg.trim() && !isHttpUrl(leg)) {
    return leg.trim();
  }
  return null;
}

/**
 * @param {unknown} resultPayload
 * @returns {string | null}
 */
function resolveArtifactModelMetadataStorageKey(resultPayload) {
  const real = getRealProcessorBlock(resultPayload);
  if (!real) {
    return null;
  }
  const direct = real.artifactModelMetadataStorageKey;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const leg = real.modelMetadataUrl;
  if (typeof leg === "string" && leg.trim() && !isHttpUrl(leg)) {
    return leg.trim();
  }
  return null;
}

/**
 * @param {string} storageKey
 * @param {string} userId
 * @param {string} scanId
 */
function assertArtifactKeyScopedToScan(storageKey, userId, scanId) {
  const k = String(storageKey || "").trim();
  const uid = String(userId || "")
    .trim()
    .toLowerCase();
  const sid = String(scanId || "")
    .trim()
    .toLowerCase();
  if (!k || k.includes("..")) {
    return false;
  }
  if (!uid || !sid) {
    return false;
  }
  return k.toLowerCase().includes(uid) && k.toLowerCase().includes(sid);
}

/**
 * Computes availability from keys still present on the clone, then removes secrets from `result_payload`.
 *
 * @param {unknown} payload cloned `result_payload`
 * @returns {{ artifact_aggregation_available: boolean; artifact_model_metadata_available: boolean }}
 */
function sanitizeArtifactsForClientPayload(payload) {
  const aggKey = resolveArtifactAggregationStorageKey(payload);
  const metaKey = resolveArtifactModelMetadataStorageKey(payload);
  const artifact_aggregation_available = Boolean(aggKey);
  const artifact_model_metadata_available = Boolean(metaKey);

  const real = getRealProcessorBlock(payload);
  if (real) {
    delete real.aggregationResultUrl;
    delete real.modelMetadataUrl;
    delete real.artifactAggregationStorageKey;
    delete real.artifactModelMetadataStorageKey;
  }

  return { artifact_aggregation_available, artifact_model_metadata_available };
}

module.exports = {
  resolveArtifactAggregationStorageKey,
  resolveArtifactModelMetadataStorageKey,
  assertArtifactKeyScopedToScan,
  sanitizeArtifactsForClientPayload
};
