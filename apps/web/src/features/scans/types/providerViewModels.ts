import type { ScanHeatmap, ScanModelInsight } from "@/lib/mock-data";

export type ProviderTone = "default" | "success" | "warning" | "danger" | "muted" | "attribution";

export type ProviderSignalViewModel = {
  key: string;
  label: string;
  score: number;
  displayValue: string;
  tone: ProviderTone;
};

export type ProviderSignalGroupViewModel = {
  id: string;
  title: string;
  signals: ProviderSignalViewModel[];
};

export type ProviderResultViewModel = {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  verdictLabel: string | null;
  confidencePercent: number | null;
  summary: string | null;
  metadata: Array<{ label: string; value: string }>;
  signalGroups: ProviderSignalGroupViewModel[];
  modelInsights: ScanModelInsight[];
  heatmaps: ScanHeatmap[];
  timeline: Array<{ time: string; event: string }>;
  rawOutput: unknown;
  sections: {
    showMetadata: boolean;
    showSignals: boolean;
    showHeatmaps: boolean;
    showModelInsights: boolean;
    showTimeline: boolean;
    showRawOutput: boolean;
    showArtifacts: boolean;
  };
};

export type ProviderTabViewModel = {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
};

export type AdaptedScanProvidersViewModel = {
  tabs: ProviderTabViewModel[];
  defaultProviderId: string;
  viewsById: Record<string, ProviderResultViewModel>;
};
