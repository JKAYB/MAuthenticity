import { useQuery } from "@tanstack/react-query";
import {
  getScanById,
  getScanHistory,
  getScanAnalyticsActivity,
  getScanAnalyticsDetectionMix,
  type ScanAnalyticsRange,
} from "@/lib/api";
import { apiScanToUiScan } from "@/lib/scan-adapter";
import type { NormalizedMediaType, Scan } from "@/lib/mock-data";
import { scanKeys } from "./queryKeys";

/** Poll scan detail while worker is still running (API `pending` / `processing` → UI `pending`). */
const SCAN_DETAIL_POLL_MS = 2500;

export function useScanHistoryQuery(options: {
  page: number;
  limit: number;
  mediaType?: NormalizedMediaType;
  enabled?: boolean;
}) {
  const { page, limit, mediaType, enabled = true } = options;
  return useQuery({
    queryKey: [...scanKeys.history(page, limit), mediaType || "all-media"],
    queryFn: async (): Promise<Scan[]> => {
      const res = await getScanHistory({ page, limit, mediaType });
      return (res.data || []).map(apiScanToUiScan);
    },
    enabled,
  });
}

export function useScanAnalyticsActivityQuery(options: {
  range: ScanAnalyticsRange;
  enabled?: boolean;
}) {
  const { range, enabled = true } = options;
  return useQuery({
    queryKey: scanKeys.analyticsActivity(range),
    queryFn: () => getScanAnalyticsActivity(range),
    enabled,
  });
}

export function useScanAnalyticsDetectionMixQuery(options: {
  range: ScanAnalyticsRange;
  enabled?: boolean;
}) {
  const { range, enabled = true } = options;
  return useQuery({
    queryKey: scanKeys.analyticsDetectionMix(range),
    queryFn: () => getScanAnalyticsDetectionMix(range),
    enabled,
  });
}

export function useScanByIdQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: scanKeys.detail(id),
    queryFn: async (): Promise<Scan> => {
      const row = await getScanById(id);
      return apiScanToUiScan(row);
    },
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status !== "pending") return false;
      return SCAN_DETAIL_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
