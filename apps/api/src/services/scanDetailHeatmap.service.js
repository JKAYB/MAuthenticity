"use strict";

const {
  analyzePresignedHeatmapUrl,
  isVendorPresignedUrlExpiredOrNear
} = require("@media-auth/scan-storage");
const { sanitizeArtifactsForClientPayload } = require("./scanDetailArtifact.service");

const HEATMAP_ASSET_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Scan detail GET + heatmap streaming
 *
 * Reality Defender returns `media.heatmaps` as model → **vendor presigned S3 URL**. The adapter copies
 * that into `details.heatmaps`, `buildResultPayload` nests it under `result_payload.processors.real`, and
 * `markCompleted` persists JSONB — those URLs expire, so replaying them from GET /scan/:id is unsafe.
 *
 * Worker `persistRdHeatmaps` replaces vendor URLs with **owned refs** `{ modelName, storageKey, mimeType, assetName }`
 * before persistence. This module:
 * - strips `storageKey` from JSON sent to clients (refs stay server-side);
 * - for **legacy** rows still holding vendor URL maps, drops entries that are expired / near-expiry and sets
 *   `heatmaps_expired` on the API response.
 *
 * @param {unknown} v
 */
function deepCloneJson(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

/**
 * @param {unknown} payload cloned `result_payload`
 * @returns {boolean} whether any vendor heatmap URL was removed as unusable
 */
function sanitizeHeatmapsOnClientPayload(payload) {
  let heatmapsExpired = false;
  const real = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.processors?.real : null;
  if (!real || typeof real !== "object" || Array.isArray(real)) {
    return false;
  }

  const hm = real.heatmaps;
  if (!hm) {
    return false;
  }

  const logDebug = process.env.HEATMAP_DEBUG_LOG === "1";

  if (Array.isArray(hm)) {
    if (logDebug) {
      console.info(`[heatmap-debug] source=owned_refs count=${hm.length} (vendor URLs not in payload)`);
    }
    real.heatmaps = hm.map((ref) => {
      if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
        return ref;
      }
      const o = /** @type {Record<string, unknown>} */ (ref);
      const modelName = typeof o.modelName === "string" ? o.modelName : "";
      const assetName = typeof o.assetName === "string" ? o.assetName : "";
      const mimeType = typeof o.mimeType === "string" ? o.mimeType : "image/png";
      return { modelName, assetName, mimeType };
    });
    return heatmapsExpired;
  }

  if (typeof hm === "object") {
    /** @type {Record<string, string>} */
    const next = { ...hm };
    for (const [model, url] of Object.entries(hm)) {
      if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
        continue;
      }
      const trimmed = url.trim();
      const analysis = analyzePresignedHeatmapUrl(trimmed);
      const bad = isVendorPresignedUrlExpiredOrNear(trimmed, 120);
      if (logDebug) {
        console.info(
          `[heatmap-debug] model=${model} source=vendor_url hasDate=${analysis.hasXAmzDate} hasExpires=${analysis.hasXAmzExpires} signedAt=${analysis.signedAtIso ?? "n/a"} expiresIn=${analysis.expiresInSec ?? "n/a"} expiresAt=${analysis.expiresAtIso ?? "n/a"} now=${analysis.nowIso} expired=${String(analysis.expired)} omit=${String(bad)}`
        );
      }
      if (bad) {
        delete next[model];
        heatmapsExpired = true;
      }
    }
    real.heatmaps = Object.keys(next).length ? next : {};
    return heatmapsExpired;
  }

  return false;
}

/**
 * @param {import('pg').QueryResultRow} scanRow
 * @returns {{
 *   row: import('pg').QueryResultRow;
 *   heatmaps_expired: boolean;
 *   artifact_aggregation_available: boolean;
 *   artifact_model_metadata_available: boolean;
 * }}
 */
function formatScanRowForClient(scanRow) {
  if (!scanRow || scanRow.result_payload == null) {
    if (!scanRow) {
      return {
        row: scanRow,
        heatmaps_expired: false,
        artifact_aggregation_available: false,
        artifact_model_metadata_available: false
      };
    }
    const { user_id: _uid, ...rest } = scanRow;
    return {
      row: rest,
      heatmaps_expired: false,
      artifact_aggregation_available: false,
      artifact_model_metadata_available: false
    };
  }
  const row = { ...scanRow, result_payload: deepCloneJson(scanRow.result_payload) };
  const heatmaps_expired = sanitizeHeatmapsOnClientPayload(row.result_payload);
  const {
    artifact_aggregation_available,
    artifact_model_metadata_available
  } = sanitizeArtifactsForClientPayload(row.result_payload);
  const { user_id: _ownerId, ...clientRow } = row;
  return {
    row: clientRow,
    heatmaps_expired,
    artifact_aggregation_available,
    artifact_model_metadata_available
  };
}

/**
 * Locate persisted heatmap ref on the **database** payload (includes `storageKey`).
 *
 * @param {unknown} resultPayload
 * @param {string} assetName
 * @returns {{ storageKey: string; mimeType: string } | null}
 */
function findHeatmapAssetRef(resultPayload, assetName) {
  const want = String(assetName || "").trim();
  if (!HEATMAP_ASSET_RE.test(want)) {
    return null;
  }
  const real = resultPayload && typeof resultPayload === "object" && !Array.isArray(resultPayload)
    ? resultPayload.processors?.real
    : null;
  const hm = real && typeof real === "object" && !Array.isArray(real) ? real.heatmaps : null;
  if (!Array.isArray(hm)) {
    return null;
  }
  for (const ref of hm) {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
      continue;
    }
    const o = /** @type {Record<string, unknown>} */ (ref);
    if (o.assetName !== want) {
      continue;
    }
    const storageKey = typeof o.storageKey === "string" ? o.storageKey.trim() : "";
    if (!storageKey) {
      return null;
    }
    const mimeType = typeof o.mimeType === "string" && o.mimeType.trim() ? o.mimeType.trim() : "image/png";
    return { storageKey, mimeType };
  }
  return null;
}

module.exports = {
  formatScanRowForClient,
  findHeatmapAssetRef,
  HEATMAP_ASSET_RE
};
