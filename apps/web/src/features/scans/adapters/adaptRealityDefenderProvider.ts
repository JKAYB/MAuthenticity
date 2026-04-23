import type { Scan } from "@/lib/mock-data";
import { formatScorePercentage } from "@/lib/percentage";
import type { ProviderResultViewModel } from "../types/providerViewModels";

function verdictFromStatus(status: Scan["status"]): string | null {
  if (status === "safe") return "Authentic";
  if (status === "flagged") return "Likely AI Generated";
  if (status === "suspicious") return "Suspicious";
  return null;
}

export function adaptRealityDefenderProvider(params: {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  providerData: unknown;
  scan: Scan;
}): ProviderResultViewModel {
  const scan = params.scan;
  const signals = scan.detections || [];
  const metadata = scan.metadata.map((m) => ({ label: m.key, value: m.value }));

  return {
    id: params.id,
    name: params.name,
    status: params.status,
    verdictLabel: verdictFromStatus(scan.status),
    confidencePercent: Number.isFinite(scan.confidence) ? Math.floor(scan.confidence) : null,
    summary: scan.lastError || null,
    metadata,
    signalGroups: signals.length
      ? [
          {
            id: "signals",
            title: "Signals",
            signals: signals.map((s, idx) => ({
              key: `${s.label}-${idx}`,
              label: s.label,
              score: s.score,
              displayValue: `${formatScorePercentage(s.score)}%`,
              tone: s.score >= 0.7 ? "danger" : s.score >= 0.4 ? "warning" : "success",
            })),
          },
        ]
      : [],
    modelInsights: scan.modelInsights || [],
    heatmaps: scan.heatmaps || [],
    timeline: scan.timeline || [],
    rawOutput: params.providerData ?? null,
    sections: {
      showMetadata: true,
      showSignals: signals.length > 0,
      showHeatmaps: (scan.heatmaps || []).length > 0 || scan.heatmapsExpired === true,
      showModelInsights: (scan.modelInsights || []).length > 0,
      showTimeline: (scan.timeline || []).length > 0,
      showRawOutput: true,
      showArtifacts: true,
    },
  };
}
