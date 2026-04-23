export const HIVE_SAFE_CLASSES = new Set(["not_ai_generated", "none", "not_ai_generated_audio"]);
export const HIVE_RISK_CLASSES = new Set(["ai_generated", "deepfake", "ai_generated_audio"]);
export const HIVE_ALWAYS_HIDDEN_CLASSES = new Set(["none"]);
export const HIVE_AUDIO_ONLY_VERDICT_CLASSES = new Set([
  "not_ai_generated_audio",
  "ai_generated_audio",
]);

export function normalizeHiveClassLabel(label: string): string {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

export function classifyHiveClass(label: string): "safe" | "risk" | "attribution" {
  const normalized = normalizeHiveClassLabel(label);
  if (HIVE_SAFE_CLASSES.has(normalized)) return "safe";
  if (HIVE_RISK_CLASSES.has(normalized)) return "risk";
  return "attribution";
}
