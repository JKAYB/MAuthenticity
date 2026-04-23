const { resolveActiveProviderIds, getProvider } = require("./registry");
const { normalizeProviderResult } = require("./validate");
const { buildResultPayload } = require("./resultPayload");
const { persistRealityDefenderHeatmaps } = require("./persistRdHeatmaps");
const { persistRealityDefenderArtifacts } = require("./persistRdArtifacts");

const SENSITIVE_KEY_RE = /(authorization|api[-_]?key|token|secret|password|cookie|set-cookie)/i;

function sanitizeRaw(value, depth = 0) {
  if (depth > 3) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeRaw(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitizeRaw(v, depth + 1);
      }
    }
    return out;
  }
  return String(value).slice(0, 500);
}

/**
 * Public façade: resolve providers, run each, and return normalized provider results plus a payload fragment.
 *
 * @param {import('../services/scanSource').ScanMediaInput} media
 * @param {{ scanId: string; userId?: string | null; storageProvider?: string }} ctx
 * @param {{ providerIds?: string[]; onProviderStatus?: (event: { providerId: string; status: "queued" | "processing" | "completed" | "failed" }) => Promise<void> | void }} [opts]
 * @returns {Promise<{ detections: import('./contract').ProviderResult[]; primaryDetection: import('./contract').ProviderResult; resultPayload: ReturnType<typeof buildResultPayload> }>}
 */
async function runDetection(media, ctx, opts = {}) {
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

  const providerIds = resolveActiveProviderIds(opts.providerIds);
  /** @type {import('./contract').ProviderResult[]} */
  const detections = [];
  /** @type {{ providerId: string; message: string }[]} */
  const failedProviders = [];
  const onProviderStatus = typeof opts.onProviderStatus === "function" ? opts.onProviderStatus : null;
  for (const providerId of providerIds) {
    const provider = getProvider(providerId);
    if (onProviderStatus) {
      await onProviderStatus({ providerId: provider.id, status: "processing" });
    }
    console.info(`[detection] scan=${scanId} provider=${provider.id}`);
    try {
      const raw = await provider.detect(input);
      const normalized = normalizeProviderResult(raw, provider.id);
      if ((normalized.providerId === "real" || normalized.providerId === "reality_defender") && ctx.userId) {
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
      detections.push(normalized);
      if (onProviderStatus) {
        await onProviderStatus({ providerId: provider.id, status: "completed" });
      }
    } catch (error) {
      const message = error && error.message ? String(error.message) : "Provider detection failed";
      failedProviders.push({
        providerId: provider.id,
        message
      });
      if (onProviderStatus) {
        await onProviderStatus({ providerId: provider.id, status: "failed" });
      }
      /** @type {{ provider: string; message: string; raw: unknown; statusCode: number | null; timestamp: string }} */
      const payloadEntry = {
        provider: provider.id,
        message,
        raw: sanitizeRaw(error && (error.rawResponse || error.response || error.body || null)),
        statusCode:
          error && Number.isFinite(Number(error.statusCode))
            ? Number(error.statusCode)
            : error && Number.isFinite(Number(error.status))
              ? Number(error.status)
              : null,
        timestamp: new Date().toISOString()
      };
      failedProviders[failedProviders.length - 1].payload = payloadEntry;
    }
  }
  if (failedProviders.length > 0) {
    const msg = failedProviders.map((p) => `${p.providerId}: ${p.message}`).join("; ");
    const err = new Error(`Provider detection failed (${msg})`);
    err.failedProviders = failedProviders.map((p) => p.providerId);
    err.failedProviderDetails = failedProviders.map((p) => ({
      providerId: p.providerId,
      message: p.message
    }));
    err.failedProviderPayload = failedProviders
      .map((p) => p.payload)
      .filter((p) => p && typeof p === "object");
    throw err;
  }
  if (detections.length === 0) {
    throw new Error("No providers resolved for detection");
  }
  const resultPayload = buildResultPayload(detections);
  const primaryDetection = detections[0];

  return {
    detections,
    primaryDetection,
    resultPayload
  };
}

module.exports = {
  runDetection
};
