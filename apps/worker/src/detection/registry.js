const { mockProvider } = require("./providers/mockProvider");
const { realProvider } = require("./providers/realProvider");
const { hiveProvider } = require("./providers/hiveProvider");
const {
  enabledScanProviders
} = require("../../../api/src/config/scanProviders");

/**
 * Register detection providers here. Each must implement:
 *   `id: string`
 *   `detect(input: ProviderInput): Promise<Partial<ProviderResult> & { confidence, isAiGenerated: boolean|null, summary, details? }>`
 * Return values are normalized by `validate.normalizeProviderResult`.
 */
const providersById = {
  [mockProvider.id]: mockProvider,
  [realProvider.id]: realProvider,
  [hiveProvider.id]: hiveProvider,
  reality_defender: {
    id: "reality_defender",
    detect: realProvider.detect
  }
};

function normalizeEnvId(raw) {
  const s = String(raw || "mock")
    .trim()
    .toLowerCase();
  return s || "mock";
}

function resolveActiveProviderIds(requestedIds) {
  if (Array.isArray(requestedIds) && requestedIds.length > 0) {
    const resolved = requestedIds
      .map(normalizeEnvId)
      .filter((id) => providersById[id]);
    if (resolved.length > 0) {
      return resolved;
    }
  }
  const enabled = enabledScanProviders()
    .map((p) => p.id)
    .filter((id) => providersById[id]);
  if (enabled.length > 0) {
    return enabled;
  }
  const wanted = normalizeEnvId(process.env.DETECTION_PROVIDER);
  if (providersById[wanted]) {
    return [wanted];
  }
  console.warn(
    `[detection] No enabled providers resolved; using fallback "${mockProvider.id}"`
  );
  return [mockProvider.id];
}

function getProvider(providerId) {
  return providersById[providerId] || mockProvider;
}

module.exports = {
  providersById,
  resolveActiveProviderIds,
  getProvider
};
