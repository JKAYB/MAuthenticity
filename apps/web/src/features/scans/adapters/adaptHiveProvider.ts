import type { Scan } from "@/lib/mock-data";
import { formatScorePercentage } from "@/lib/percentage";
import {
  classifyHiveClass,
  HIVE_ALWAYS_HIDDEN_CLASSES,
  HIVE_AUDIO_ONLY_VERDICT_CLASSES,
  normalizeHiveClassLabel,
} from "../constants/hiveMappings";
import type { ProviderResultViewModel, ProviderSignalViewModel } from "../types/providerViewModels";

type HiveClassRow = { class?: string; value?: number };
const ATTRIBUTION_MIN_SCORE = 0.02;

function toneForHive(kind: "safe" | "risk" | "attribution") {
  if (kind === "safe") return "success" as const;
  if (kind === "risk") return "danger" as const;
  return "attribution" as const;
}

function extractHiveClasses(providerData: unknown): HiveClassRow[] {
  if (!providerData || typeof providerData !== "object") return [];
  const classes =
    (providerData as { upstream?: { output?: Array<{ classes?: HiveClassRow[] }> } }).upstream
      ?.output?.[0]?.classes || [];
  return Array.isArray(classes) ? classes : [];
}

export function normalizeHiveScoreToUnit(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  return 1;
}

function isAudioContext(kind: Scan["kind"]): boolean {
  return kind === "audio";
}

function isVideoContext(kind: Scan["kind"]): boolean {
  return kind === "video";
}

export function isHiveClassVisibleForMediaKind(
  normalizedLabel: string,
  kind: Scan["kind"],
): boolean {
  if (HIVE_ALWAYS_HIDDEN_CLASSES.has(normalizedLabel)) return false;
  if (HIVE_AUDIO_ONLY_VERDICT_CLASSES.has(normalizedLabel)) {
    return isAudioContext(kind) || isVideoContext(kind);
  }
  return true;
}

export function shouldIncludeAttributionSignal(score: number): boolean {
  return score >= ATTRIBUTION_MIN_SCORE;
}

export function adaptHiveProvider(params: {
  id: string;
  name: string;
  status: "queued" | "processing" | "completed" | "failed";
  providerData: unknown;
  scan: Scan;
}): ProviderResultViewModel {
  const rows = extractHiveClasses(params.providerData);
  const dedup = new Map<string, ProviderSignalViewModel>();
  for (const row of rows) {
    if (!row || typeof row.class !== "string") continue;
    const normalizedScore = normalizeHiveScoreToUnit(Number(row.value));
    if (normalizedScore == null) continue;
    const normalized = normalizeHiveClassLabel(row.class);
    if (!isHiveClassVisibleForMediaKind(normalized, params.scan.kind)) continue;
    const kind = classifyHiveClass(normalized);
    const signal: ProviderSignalViewModel = {
      key: normalized,
      label: row.class.replace(/_/g, " "),
      score: normalizedScore,
      displayValue: `${formatScorePercentage(normalizedScore)}%`,
      tone: toneForHive(kind),
    };
    const existing = dedup.get(normalized);
    if (!existing || signal.score > existing.score) {
      dedup.set(normalized, signal);
    }
  }

  const signals = [...dedup.values()].sort((a, b) => b.score - a.score);
  const risk = signals.filter((s) => s.tone === "danger");
  const safe = signals.filter((s) => s.tone === "success");
  const attribution = signals.filter(
    (s) => s.tone === "attribution" && shouldIncludeAttributionSignal(s.score),
  );

  const topSafe = safe[0] || null;
  const topRisk = risk[0] || null;
  const verdictLabel =
    topRisk && (!topSafe || topRisk.score >= topSafe.score)
      ? "AI Generated"
      : topSafe
        ? "Authentic"
        : null;
  const confidencePercent =
    topRisk && (!topSafe || topRisk.score >= topSafe.score)
      ? formatScorePercentage(topRisk.score)
      : topSafe
        ? formatScorePercentage(topSafe.score)
        : null;

  return {
    id: params.id,
    name: params.name,
    status: params.status,
    verdictLabel,
    confidencePercent,
    summary: verdictLabel ? `Hive verdict: ${verdictLabel}` : null,
    metadata: [
      { label: "Provider", value: params.name },
      { label: "Classes", value: String(rows.length) },
      { label: "Signals", value: String(risk.length + safe.length + attribution.length) },
    ],
    signalGroups: [
      { id: "risk", title: "AI / Risk", signals: risk },
      { id: "safe", title: "Safe / Authentic", signals: safe },
      { id: "attribution", title: "Attribution", signals: attribution },
    ].filter((g) => g.signals.length > 0),
    modelInsights: [],
    heatmaps: [],
    timeline: [
      { time: "—", event: "Hive provider payload loaded" },
      { time: "—", event: `Classes parsed: ${rows.length}` },
    ],
    rawOutput: params.providerData ?? null,
    sections: {
      showMetadata: true,
      showSignals: signals.length > 0,
      showHeatmaps: false,
      showModelInsights: false,
      showTimeline: true,
      showRawOutput: true,
      showArtifacts: false,
    },
  };
}
