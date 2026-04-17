import { useQuery } from "@tanstack/react-query";
import { getScanById, getScanHistory } from "@/lib/api";
import { apiScanToUiScan } from "@/lib/scan-adapter";
import type { Scan } from "@/lib/mock-data";
import { scanKeys } from "./queryKeys";

export function useScanHistoryQuery(options: {
  page: number;
  limit: number;
  enabled?: boolean;
}) {
  const { page, limit, enabled = true } = options;
  return useQuery({
    queryKey: scanKeys.history(page, limit),
    queryFn: async (): Promise<Scan[]> => {
      const res = await getScanHistory({ page, limit });
      return (res.data || []).map(apiScanToUiScan);
    },
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
  });
}
