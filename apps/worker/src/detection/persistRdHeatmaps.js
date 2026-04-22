"use strict";

const { getStorageForProvider } = require("@media-auth/scan-storage");

const MAX_HEATMAP_BYTES = 15 * 1024 * 1024;
const FETCH_MS = 60_000;

/**
 * HEATMAP DATA FLOW (Reality Defender → DB → scan GET)
 *
 * 1. `realityDefenderAdapter.detectRealityDefender` polls RD until media JSON is ready.
 * 2. `mapMediaToProviderFields` copies `media.heatmaps` (object: modelName → vendor presigned HTTPS URL)
 *    into `details.heatmaps` on the provider result.
 * 3. `runDetection` → `buildResultPayload` stores that object under `result_payload.processors.real.heatmaps`.
 * 4. `markCompleted` persists the whole `result_payload` JSONB on `scans` (vendor URLs were durable = bug:
 *    presigned URLs expire; replaying them from GET /scan/:id breaks previews).
 * 5. This module runs **before** `buildResultPayload`: it downloads each vendor URL once, writes bytes via
 *    `@media-auth/scan-storage` (`saveDerivedAsset` → `scans/users/{userId}/{scanId}/derived/{asset}`),
 *    then replaces `details.heatmaps` with stable refs `{ modelName, storageKey, mimeType, assetName }`.
 * 6. `apps/api` GET `/scan/:id` strips `storageKey` from the JSON (see `scanDetailHeatmap.service.js`) and
 *    serves bytes on authenticated GET `/scan/:id/heatmaps/:assetName`.
 *
 * @param {{ userId: string; scanId: string; storageProvider: string; details: Record<string, unknown> }} args
 * @returns {Promise<void>}
 */
async function persistRealityDefenderHeatmaps({ userId, scanId, storageProvider, details }) {
  if (!userId || !scanId || !details || typeof details !== "object") {
    return;
  }
  const hm = details.heatmaps;
  if (!hm || typeof hm !== "object" || Array.isArray(hm)) {
    return;
  }

  const entries = Object.entries(hm).filter(
    ([k, v]) => typeof k === "string" && typeof v === "string" && /^https?:\/\//i.test(v.trim())
  );
  if (entries.length === 0) {
    return;
  }

  const provider = storageProvider && String(storageProvider).trim().toLowerCase() ? String(storageProvider).trim().toLowerCase() : "local";
  const storage = getStorageForProvider(provider);
  if (typeof storage.saveDerivedAsset !== "function") {
    console.warn("[heatmap-persist] storage backend has no saveDerivedAsset; leaving vendor URLs");
    return;
  }

  /** @type {{ modelName: string; storageKey: string; mimeType: string; assetName: string }[]} */
  const refs = [];

  for (const [modelName, urlRaw] of entries) {
    const url = urlRaw.trim();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_MS);
    try {
      const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
      if (!res.ok) {
        console.warn(`[heatmap-persist] fetch failed model=${modelName} status=${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_HEATMAP_BYTES) {
        console.warn(`[heatmap-persist] skip model=${modelName} size=${buf.length}`);
        continue;
      }
      const mimeHeader = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const mimeType =
        mimeHeader && (mimeHeader.startsWith("image/") || mimeHeader === "application/octet-stream")
          ? mimeHeader
          : "image/png";
      const ext =
        mimeType === "image/jpeg" || mimeType === "image/jpg"
          ? ".jpg"
          : mimeType === "image/webp"
            ? ".webp"
            : mimeType === "image/gif"
              ? ".gif"
              : ".png";
      const stem = String(modelName || "model")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 72) || "model";
      const assetName = `hm_${stem}${ext}`;

      const saved = await storage.saveDerivedAsset({
        userId,
        scanId,
        assetName,
        buffer: buf,
        contentType: mimeType
      });
      refs.push({
        modelName,
        storageKey: saved.storageKey,
        mimeType,
        assetName
      });
    } catch (e) {
      const msg = e && /** @type {Error} */ (e).message ? /** @type {Error} */ (e).message : String(e);
      console.warn(`[heatmap-persist] model=${modelName} error=${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (entries.length > 0) {
    if (refs.length > 0) {
      details.heatmaps = refs;
    } else {
      console.warn("[heatmap-persist] all heatmap downloads failed; omitting vendor URLs from persistence");
      details.heatmaps = {};
    }
  }
}

module.exports = {
  persistRealityDefenderHeatmaps
};
