export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  reality_defender: "Reality Defender",
  real: "Reality Defender",
  hive: "Hive",
};

export function getProviderDisplayName(id: string): string {
  const normalized = String(id || "")
    .trim()
    .toLowerCase();
  if (PROVIDER_DISPLAY_NAMES[normalized]) {
    return PROVIDER_DISPLAY_NAMES[normalized];
  }
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
