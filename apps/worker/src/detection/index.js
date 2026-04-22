const { resolveActiveProviderId, getProvider } = require("./registry");
const { normalizeProviderResult } = require("./validate");
const { buildResultPayload } = require("./resultPayload");
const { persistRealityDefenderHeatmaps } = require("./persistRdHeatmaps");
const { persistRealityDefenderArtifacts } = require("./persistRdArtifacts");

/**
 * Public façade: resolve the configured provider, run it, return a normalized result + DB payload fragment.
 *
 * @param {import('../services/scanSource').ScanMediaInput} media
 * @param {{ scanId: string; userId?: string | null; storageProvider?: string }} ctx
 * @returns {Promise<import('./contract').ProviderResult & { resultPayload: ReturnType<typeof buildResultPayload> }>}
 */
async function runDetection(media, ctx) {
  const scanId = ctx && ctx.scanId;
  if (!scanId) {
    throw new Error("runDetection requires ctx.scanId");
  }

  /** @type {import('./contract').ProviderInput} */
  const input = {
    ...media,
    scanId,
    userId: ctx.userId != null ? ctx.userId : null
  };

  const providerId = resolveActiveProviderId();
  const provider = getProvider(providerId);

  console.info(`[detection] scan=${scanId} provider=${provider.id}`);

  const raw = await provider.detect(input);
  const normalized = normalizeProviderResult(raw, provider.id);

  if (normalized.providerId === "real" && ctx.userId) {
    await persistRealityDefenderHeatmaps({
      userId: ctx.userId,
      scanId,
      storageProvider: ctx.storageProvider || "local",
      details: normalized.details
    });
    await persistRealityDefenderArtifacts({
      userId: ctx.userId,
      scanId,
      storageProvider: ctx.storageProvider || "local",
      details: normalized.details
    });
  }

  const resultPayload = buildResultPayload(normalized);

  return {
    ...normalized,
    resultPayload
  };
}

module.exports = {
  runDetection
};
