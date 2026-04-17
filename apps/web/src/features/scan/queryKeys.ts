/**
 * Central query keys for scan-related APIs (history, detail, uploads).
 * Use these when adding `useQuery` / `useMutation` for scans later.
 */
export const scanKeys = {
  all: ["scans"] as const,
  history: (page?: number, limit?: number) => [...scanKeys.all, "history", { page, limit }] as const,
  detail: (id: string) => [...scanKeys.all, "detail", id] as const,
};
