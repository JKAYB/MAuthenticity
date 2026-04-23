import type { MediaKind } from "@/lib/mock-data";
import { formatHiveOutput } from "./hive";
import { formatRealityDefenderOutput } from "./reality-defender";

export * from "./types";
export { classifyHiveLabel, formatHiveOutput } from "./hive";
export { formatRealityDefenderOutput } from "./reality-defender";

export const providerOutputRegistry = {
  reality_defender: formatRealityDefenderOutput,
  hive: formatHiveOutput
} as const;

export function formatProviderOutputs(payload: unknown, mediaKind: MediaKind) {
  const reality = providerOutputRegistry.reality_defender(payload);
  const hive = providerOutputRegistry.hive(payload, { mediaKind });
  return { reality, hive };
}
