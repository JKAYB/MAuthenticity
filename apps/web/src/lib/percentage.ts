export function formatPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value * 100);
}

export function formatScorePercentage(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const normalized = Math.min(1, Math.max(0, score));
  return formatPercentage(normalized);
}

export function formatMaybePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? formatPercentage(value) : Math.floor(value);
}
