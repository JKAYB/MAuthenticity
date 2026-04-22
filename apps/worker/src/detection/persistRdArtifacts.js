"use strict";

const { getStorageForProvider } = require("@media-auth/scan-storage");

const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
const FETCH_MS = 60_000;

/**
 * @param {string} s
 */
function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s.trim());
}

/**
 * Persist RD aggregation / model-metadata JSON into scan-storage and replace vendor URLs or legacy
 * misnamed `aggregationResultUrl` storage-key strings with `artifact*StorageKey` fields (see
 * `apps/api/src/services/scanDetailArtifact.service.js`).
 *
 * @param {{ userId: string; scanId: string; storageProvider: string; details: Record<string, unknown> }} args
 * @returns {Promise<void>}
 */
async function persistRealityDefenderArtifacts({ userId, scanId, storageProvider, details }) {
  if (!userId || !scanId || !details || typeof details !== "object") {
    return;
  }

  const provider =
    storageProvider && String(storageProvider).trim().toLowerCase()
      ? String(storageProvider).trim().toLowerCase()
      : "local";
  const storage = getStorageForProvider(provider);
  if (typeof storage.saveDerivedAsset !== "function") {
    console.warn("[artifact-persist] storage backend has no saveDerivedAsset; skipping artifacts");
    return;
  }

  const agg = details.aggregationResultUrl;
  if (typeof agg === "string" && agg.trim()) {
    const trimmed = agg.trim();
    if (isHttpUrl(trimmed)) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_MS);
      try {
        const res = await fetch(trimmed, { signal: ac.signal, redirect: "follow" });
        if (!res.ok) {
          console.warn(`[artifact-persist] aggregation fetch failed status=${res.status}`);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 0 && buf.length <= MAX_ARTIFACT_BYTES) {
            const ct = (res.headers.get("content-type") || "").split(";")[0].trim() || "application/json";
            const saved = await storage.saveDerivedAsset({
              userId,
              scanId,
              assetName: "artifact_aggregation.json",
              buffer: buf,
              contentType: ct.includes("json") ? "application/json" : ct
            });
            details.artifactAggregationStorageKey = saved.storageKey;
          }
        }
      } catch (e) {
        const msg = e && /** @type {Error} */ (e).message ? /** @type {Error} */ (e).message : String(e);
        console.warn(`[artifact-persist] aggregation error=${msg}`);
      } finally {
        clearTimeout(timer);
      }
    } else {
      details.artifactAggregationStorageKey = trimmed;
    }
    delete details.aggregationResultUrl;
  }

  const meta = details.modelMetadataUrl;
  if (typeof meta === "string" && meta.trim()) {
    const trimmed = meta.trim();
    if (isHttpUrl(trimmed)) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), FETCH_MS);
      try {
        const res = await fetch(trimmed, { signal: ac.signal, redirect: "follow" });
        if (!res.ok) {
          console.warn(`[artifact-persist] modelMetadata fetch failed status=${res.status}`);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 0 && buf.length <= MAX_ARTIFACT_BYTES) {
            const ct = (res.headers.get("content-type") || "").split(";")[0].trim() || "application/json";
            const saved = await storage.saveDerivedAsset({
              userId,
              scanId,
              assetName: "artifact_model_metadata.json",
              buffer: buf,
              contentType: ct.includes("json") ? "application/json" : ct
            });
            details.artifactModelMetadataStorageKey = saved.storageKey;
          }
        }
      } catch (e) {
        const msg = e && /** @type {Error} */ (e).message ? /** @type {Error} */ (e).message : String(e);
        console.warn(`[artifact-persist] modelMetadata error=${msg}`);
      } finally {
        clearTimeout(timer);
      }
    } else {
      details.artifactModelMetadataStorageKey = trimmed;
    }
    delete details.modelMetadataUrl;
  }
}

module.exports = {
  persistRealityDefenderArtifacts
};
