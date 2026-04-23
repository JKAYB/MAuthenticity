"use strict";

const SCAN_PROVIDERS = [
  {
    id: "reality_defender",
    name: "Reality Defender",
    enabled: true,
    supports: { image: true, video: true, audio: true, url: false },
    access: { free: true, individual: true, organization: true },
    sortOrder: 1
  },
  {
    id: "hive",
    name: "Hive",
    enabled: true,
    supports: { image: true, video: true, audio: false, url: false },
    access: { free: false, individual: true, organization: true },
    sortOrder: 2
  }
];

const MEDIA_KIND_VALUES = ["image", "video", "audio", "document", "other", "url"];

function normalizeId(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function scanProviders() {
  return SCAN_PROVIDERS.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function enabledScanProviders() {
  return scanProviders().filter((p) => p.enabled);
}

function providerById(id) {
  const want = normalizeId(id);
  if (!want) return null;
  return scanProviders().find((p) => p.id === want) || null;
}

function parseRequestedProviderIds(raw) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(normalizeId).filter(Boolean))];
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return [...new Set(parsed.map(normalizeId).filter(Boolean))];
        }
      } catch {
        return [];
      }
    }
    return [...new Set(trimmed.split(",").map(normalizeId).filter(Boolean))];
  }
  return [];
}

function mediaKindFromMime(mimeType) {
  const m = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || m.startsWith("text/") || m.includes("msword") || m.includes("wordprocessingml")) {
    return "document";
  }
  return "other";
}

function supportsMedia(provider, mediaKind) {
  const k = String(mediaKind || "").trim().toLowerCase();
  if (!MEDIA_KIND_VALUES.includes(k)) return true;
  const supports = provider && provider.supports ? provider.supports : null;
  if (!supports || typeof supports !== "object") return true;
  return supports[k] !== false;
}

/**
 * Resolve provider ids for one scan request.
 * Plan/access gating is not enforced yet; metadata is returned for future use.
 */
function resolveProviderIdsForScan({ requestedIds, mimeType, sourceType }) {
  const enabled = enabledScanProviders();
  const allowedIds = new Set(enabled.map((p) => p.id));
  const reqIds = Array.isArray(requestedIds) ? requestedIds.map(normalizeId).filter(Boolean) : [];
  const unknownIds = reqIds.filter((id) => !allowedIds.has(id));
  if (unknownIds.length > 0) {
    return { ok: false, error: `Unknown or disabled providers: ${unknownIds.join(", ")}` };
  }
  const selected = reqIds.length > 0 ? reqIds : enabled.map((p) => p.id);
  const mediaKind = sourceType === "url" ? "url" : mediaKindFromMime(mimeType);
  const unsupported = selected.filter((id) => {
    const provider = providerById(id);
    return provider ? !supportsMedia(provider, mediaKind) : true;
  });
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `Selected providers do not support this media type: ${unsupported.join(", ")}`
    };
  }
  return { ok: true, providerIds: selected };
}

module.exports = {
  scanProviders,
  enabledScanProviders,
  providerById,
  parseRequestedProviderIds,
  resolveProviderIdsForScan
};
