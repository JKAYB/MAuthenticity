/**
 * Central query keys for scan-related APIs (history, detail, uploads).
 * Use these when adding `useQuery` / `useMutation` for scans later.
 */
export const scanKeys = {
  all: ["scans"] as const,
  history: (
    page?: number,
    limit?: number,
    mediaType?: "image" | "video" | "audio" | "document" | "other",
  ) => [...scanKeys.all, "history", { page, limit, mediaType }] as const,
  detail: (id: string) => [...scanKeys.all, "detail", id] as const,
  analyticsActivity: (range: string) => [...scanKeys.all, "analytics", "activity", range] as const,
  analyticsDetectionMix: (range: string) =>
    [...scanKeys.all, "analytics", "detectionMix", range] as const,
};
