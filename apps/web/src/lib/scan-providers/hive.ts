import type { MediaKind } from "@/lib/mock-data";
import type { ProviderSection, ProviderSignal, ProviderTone } from "./types";

type HiveClass = {
  class?: string;
  value?: number;
};

type HiveProcessorPayload = {
  upstream?: {
    output?: Array<{
      classes?: HiveClass[];
    }>;
  };
};

const SAFE_LABELS = new Set(["not_ai_generated", "none", "not_ai_generated_audio"]);
const RISK_LABELS = new Set(["ai_generated", "deepfake", "ai_generated_audio"]);

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeHiveLabel(label: string): string {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function classifyHiveLabel(label: string): "safe" | "risk" | "attribution" {
  const normalized = normalizeHiveLabel(label);
  if (SAFE_LABELS.has(normalized)) return "safe";
  if (RISK_LABELS.has(normalized)) return "risk";
  return "attribution";
}

function toneFromKind(kind: "safe" | "risk" | "attribution"): ProviderTone {
  if (kind === "safe") return "safe";
  if (kind === "risk") return "risk";
  return "attribution";
}

function isAudioSpecificLabel(label: string): boolean {
  return normalizeHiveLabel(label).includes("_audio");
}

export function formatHiveOutput(
  payload: unknown,
  opts: { mediaKind: MediaKind }
): { section: ProviderSection | null; signals: ProviderSignal[] } {
  const processors =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { processors?: Record<string, unknown> }).processors
      : undefined;
  const hive = (processors && (processors.hive as HiveProcessorPayload | undefined)) || undefined;
  const classes = hive?.upstream?.output?.[0]?.classes ?? [];

  /** Canonical-label dedupe: keep highest score for repeated labels. */
  const byLabel = new Map<string, ProviderSignal>();
  for (const entry of classes) {
    if (!entry || typeof entry.class !== "string") continue;
    const rawLabel = String(entry.class);
    const normalized = normalizeHiveLabel(rawLabel);
    const rawScore = Number(entry.value);
    if (!Number.isFinite(rawScore)) continue;
    if (opts.mediaKind !== "audio" && isAudioSpecificLabel(normalized)) continue;

    const signal: ProviderSignal = {
      rawLabel,
      label: rawLabel.replace(/_/g, " "),
      score: clamp01(rawScore),
      tone: toneFromKind(classifyHiveLabel(normalized))
    };
    const existing = byLabel.get(normalized);
    if (!existing || signal.score > existing.score) {
      byLabel.set(normalized, signal);
    }
  }

  const signals = [...byLabel.values()].filter((s) => s.score >= 0.01);
  if (signals.length === 0) {
    return { section: null, signals: [] };
  }

  const risk = signals.filter((s) => s.tone === "risk");
  const safe = signals.filter((s) => s.tone === "safe");
  const riskNonTrivial = risk.some((s) => s.score >= 0.05);
  const attribution = signals.filter(
    (s) => s.tone === "attribution" && (riskNonTrivial || s.score >= 0.05)
  );

  const topRisk = risk.slice().sort((a, b) => b.score - a.score)[0];
  const topSafe = safe.slice().sort((a, b) => b.score - a.score)[0];
  const verdict =
    topRisk && topRisk.score >= 0.5
      ? { tone: "risk" as const, label: "AI/Risk", score: topRisk.score }
      : topSafe
        ? { tone: "safe" as const, label: "Authentic", score: topSafe.score }
        : undefined;

  return {
    section: {
      kind: "hive",
      title: "Hive",
      verdict,
      signals,
      groups: [
        { id: "risk", title: "AI / Risk", signals: risk },
        { id: "safe", title: "Safe / Authentic", signals: safe },
        { id: "attribution", title: "Attribution", signals: attribution, collapsed: true }
      ]
    },
    signals
  };
}
