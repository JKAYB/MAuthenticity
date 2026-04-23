import type { ProviderResultViewModel } from "../types/providerViewModels";

export function adaptUnknownProvider(params: {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  providerData: unknown;
}): ProviderResultViewModel {
  return {
    id: params.id,
    name: params.name,
    status: params.status,
    verdictLabel: null,
    confidencePercent: null,
    summary: null,
    metadata: [{ label: "Provider", value: params.name }],
    signalGroups: [],
    modelInsights: [],
    heatmaps: [],
    timeline: [{ time: "—", event: "No provider-specific timeline available" }],
    rawOutput: params.providerData ?? null,
    sections: {
      showMetadata: true,
      showSignals: false,
      showHeatmaps: false,
      showModelInsights: false,
      showTimeline: true,
      showRawOutput: true,
      showArtifacts: false,
    },
  };
}
