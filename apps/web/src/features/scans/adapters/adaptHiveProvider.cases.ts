import type { Scan } from "@/lib/mock-data";
import {
  isHiveClassVisibleForMediaKind,
  normalizeHiveScoreToUnit,
  shouldIncludeAttributionSignal,
} from "./adaptHiveProvider";

type HiveDeterministicCase = {
  name: string;
  actual: boolean;
};

function equals(a: unknown, b: unknown): boolean {
  return Object.is(a, b);
}

export function runHiveAdapterDeterministicCases(): HiveDeterministicCase[] {
  const image = "image" as Scan["kind"];
  return [
    {
      name: "0.999999 -> 99% path (score remains < 1)",
      actual: equals(normalizeHiveScoreToUnit(0.999999), 0.999999),
    },
    {
      name: "1 -> 100% path (score remains 1)",
      actual: equals(normalizeHiveScoreToUnit(1), 1),
    },
    {
      name: "hide none",
      actual: equals(isHiveClassVisibleForMediaKind("none", image), false),
    },
    {
      name: "hide not_ai_generated_audio for image",
      actual: equals(isHiveClassVisibleForMediaKind("not_ai_generated_audio", image), false),
    },
    {
      name: "keep not_ai_generated",
      actual: equals(isHiveClassVisibleForMediaKind("not_ai_generated", image), true),
    },
    {
      name: "keep ai_generated",
      actual: equals(isHiveClassVisibleForMediaKind("ai_generated", image), true),
    },
    {
      name: "keep meaningful attribution above threshold",
      actual: equals(shouldIncludeAttributionSignal(0.03), true),
    },
  ];
}
