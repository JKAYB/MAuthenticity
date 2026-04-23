import type { Detection, ScanHeatmap, ScanModelInsight } from "@/lib/mock-data";
import type { ProviderSection } from "./types";
import { formatMaybePercent } from "@/lib/percentage";

type StoredHeatmapRef = {
  modelName: string;
  assetName: string;
  mimeType?: string;
  storageKey?: string;
};

type RealProcessorPayload = {
  mediaId?: string;
  requestId?: string;
  mediaType?: string;
  overallStatus?: string;
  resultsSummaryStatus?: string | null;
  finalScore?: number | null;
  durationSec?: number;
  fileSize?: number;
  ensemble?: ScanModelInsight;
  modelInsights?: ScanModelInsight[];
  heatmaps?: Record<string, string> | StoredHeatmapRef[];
};

type DetectionDetails = {
  detectionVendor?: string;
  requestId?: string;
  mediaType?: string;
  overallStatus?: string;
  resultsSummaryStatus?: string | null;
  finalScore?: number | null;
  durationSec?: number | null;
  fileSize?: number | null;
  modelCount?: number;
  modelInsights?: ScanModelInsight[];
  ensemble?: ScanModelInsight | null;
  heatmaps?: Record<string, string> | StoredHeatmapRef[];
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function pickModelPercent(model: ScanModelInsight): number | null {
  if (typeof model.normalizedScore === "number" && Number.isFinite(model.normalizedScore)) {
    return Math.floor(model.normalizedScore);
  }
  if (typeof model.finalScore === "number" && Number.isFinite(model.finalScore)) {
    return Math.floor(model.finalScore);
  }
  if (typeof model.score === "number" && Number.isFinite(model.score)) {
    return formatMaybePercent(model.score);
  }
  return null;
}

function isRealProcessorPayload(value: unknown): value is RealProcessorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return "mediaId" in obj || "requestId" in obj || "ensemble" in obj || "modelInsights" in obj;
}

function pickRealityDefenderProcessor(payload: unknown): RealProcessorPayload | null {
  const processors =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { processors?: Record<string, unknown> }).processors
      : null;
  if (!processors) return null;
  const candidate = processors.reality_defender || processors.real;
  if (!isRealProcessorPayload(candidate)) return null;
  return candidate;
}

function normalizeDetailsFromPayload(payload: unknown): DetectionDetails | null {
  const details =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { details?: DetectionDetails }).details
      : null;
  if (details) return details;

  const real = pickRealityDefenderProcessor(payload);
  if (!real) return null;

  const modelInsights = Array.isArray(real.modelInsights)
    ? real.modelInsights.filter((m) => m && typeof m === "object")
    : real.ensemble
      ? [real.ensemble]
      : [];

  return {
    detectionVendor: "reality_defender",
    requestId: real.requestId ?? real.mediaId,
    mediaType: real.mediaType,
    overallStatus: real.overallStatus,
    resultsSummaryStatus: real.resultsSummaryStatus ?? null,
    finalScore: typeof real.finalScore === "number" ? real.finalScore : null,
    durationSec: real.durationSec,
    fileSize: real.fileSize,
    modelInsights,
    modelCount: modelInsights.length,
    ensemble: real.ensemble ?? null,
    heatmaps: real.heatmaps as DetectionDetails["heatmaps"]
  };
}

function heatmapsFromDetails(details: DetectionDetails | null): ScanHeatmap[] {
  const h = details?.heatmaps;
  if (!h) return [];
  if (Array.isArray(h)) {
    return h
      .filter(
        (e): e is StoredHeatmapRef =>
          Boolean(e && typeof e === "object" && !Array.isArray(e)) &&
          typeof (e as StoredHeatmapRef).modelName === "string" &&
          typeof (e as StoredHeatmapRef).assetName === "string"
      )
      .map((r) => ({
        modelName: r.modelName,
        heatmapAsset: r.assetName,
        mimeType: typeof r.mimeType === "string" ? r.mimeType : "image/png"
      }));
  }
  if (typeof h === "object") {
    return Object.entries(h as Record<string, string>)
      .filter(([, url]) => typeof url === "string" && url.trim().length > 0)
      .map(([modelName, url]) => ({ modelName, url: url.trim() }));
  }
  return [];
}

export function formatRealityDefenderOutput(payload: unknown): {
  section: ProviderSection | null;
  details: DetectionDetails | null;
  detections: Detection[];
  modelInsights: ScanModelInsight[];
  modelCount: number;
  heatmaps: ScanHeatmap[];
  providerRequestId?: string;
  durationSec?: number;
} {
  const details = normalizeDetailsFromPayload(payload);
  const applicableModels = Array.isArray(details?.modelInsights)
    ? details.modelInsights.filter((m) => {
        if (!m || typeof m.name !== "string") return false;
        const status = (m.status || "").toUpperCase();
        const pct = pickModelPercent(m);
        return status !== "NOT_APPLICABLE" && status !== "ANALYZING" && pct !== null;
      })
    : [];

  const detections: Detection[] = applicableModels.map((model) => {
    const pct = pickModelPercent(model);
    return {
      label: model.name || "Model",
      score: clamp01((pct ?? 0) / 100)
    };
  });
  const heatmaps = heatmapsFromDetails(details);

  const section: ProviderSection | null =
    detections.length > 0
      ? {
          kind: "reality_defender",
          title: "Reality Defender",
          subtitle: details?.resultsSummaryStatus || undefined,
          signals: detections.map((d) => ({
            label: d.label,
            score: d.score,
            tone: d.score >= 0.7 ? "risk" : d.score >= 0.4 ? "neutral" : "safe"
          }))
        }
      : null;

  return {
    section,
    details,
    detections,
    modelInsights: applicableModels,
    modelCount: typeof details?.modelCount === "number" ? details.modelCount : applicableModels.length,
    heatmaps,
    providerRequestId: details?.requestId || undefined,
    durationSec:
      details?.durationSec != null && Number.isFinite(Number(details.durationSec))
        ? Number(details.durationSec)
        : undefined
  };
}
