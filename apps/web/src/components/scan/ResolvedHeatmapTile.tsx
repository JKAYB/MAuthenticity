import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { HeatMapCard } from "@/components/scan/HeatMapCard";
import { apiFetch } from "@/lib/api";
import { scanKeys } from "@/features/scan/queryKeys";
import type { ScanHeatmap } from "@/lib/mock-data";

/**
 * Loads heatmap bytes with JWT when `heatmap.heatmapAsset` is set (Observyx-owned storage).
 * Legacy vendor URLs are passed through to {@link HeatMapCard} as plain `src`.
 */
export function ResolvedHeatmapTile({ scanId, heatmap }: { scanId: string; heatmap: ScanHeatmap }) {
  const qc = useQueryClient();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadNonce, setLoadNonce] = useState(0);

  /** Always refetch scan JSON (fresh heatmap refs / sanitized URLs) then reload this tile’s bytes or `<img>`. */
  const refetchScanThenReload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: scanKeys.detail(scanId) });
    await qc.refetchQueries({ queryKey: scanKeys.detail(scanId) });
    setLoadNonce((n) => n + 1);
  }, [qc, scanId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (heatmap.heatmapAsset) {
        setPhase("loading");
        try {
          const res = await apiFetch(
            `/scan/${encodeURIComponent(scanId)}/heatmaps/${encodeURIComponent(heatmap.heatmapAsset)}`,
          );
          if (cancelled) {
            return;
          }
          if (!res.ok) {
            setBlobUrl((prev) => {
              if (prev && prev.startsWith("blob:")) {
                URL.revokeObjectURL(prev);
              }
              return null;
            });
            setPhase("error");
            return;
          }
          const blob = await res.blob();
          if (cancelled) {
            return;
          }
          const u = URL.createObjectURL(blob);
          setBlobUrl((prev) => {
            if (prev && prev.startsWith("blob:")) {
              URL.revokeObjectURL(prev);
            }
            return u;
          });
          setPhase("ready");
        } catch {
          if (!cancelled) {
            setPhase("error");
          }
        }
        return;
      }

      if (heatmap.url) {
        if (!cancelled) {
          setBlobUrl(heatmap.url);
          setPhase("ready");
        }
        return;
      }

      if (!cancelled) {
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [heatmap.heatmapAsset, heatmap.url, loadNonce, scanId]);

  useEffect(() => {
    return () => {
      if (blobUrl && blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (phase === "loading") {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-input/30 p-3">
        <div className="mb-2 text-sm font-medium break-words">{heatmap.modelName}</div>
        <div className="h-40 animate-pulse rounded-md bg-muted/40" aria-hidden />
      </div>
    );
  }

  if (phase === "error" || !blobUrl) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-input/30 p-3">
        <div className="mb-2 text-sm font-medium break-words">{heatmap.modelName}</div>
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <span>Could not load heatmap</span>
          <button
            type="button"
            onClick={() => void refetchScanThenReload()}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <RefreshCcw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <HeatMapCard
      heatmap={{ modelName: heatmap.modelName, url: blobUrl }}
      onRetry={refetchScanThenReload}
    />
  );
}
