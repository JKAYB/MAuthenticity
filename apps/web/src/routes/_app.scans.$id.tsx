import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Share2,
  ChevronDown,
  FileText,
  Activity,
  ListChecks,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanMediaPreview } from "@/components/scan/ScanMediaPreview";
import { StatusBadge } from "@/components/ui-ext/StatusBadge";
import { useScanByIdQuery } from "@/features/scan/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import { scans as demoScans, timeAgo, type Scan } from "@/lib/mock-data";
import { downloadScanOriginal } from "@/lib/scan-media-download";
import { formatFileSize, strictUploadPreviewKind } from "@/lib/scan-media";
import { cn } from "@/lib/utils";
import { debounce } from "lodash";
import { ResolvedHeatmapTile } from "@/components/scan/ResolvedHeatmapTile";
import { ArtifactViewButton } from "@/components/scan/ArtifactViewButton";
import { retryScanById } from "@/lib/api";
import { scanKeys } from "@/features/scan/queryKeys";
import { formatMaybePercent, formatScorePercentage } from "@/lib/percentage";
import { adaptScanProviders } from "@/features/scans/adapters/adaptScanProviders";

export const Route = createFileRoute("/_app/scans/$id")({
  head: () => ({
    meta: [{ title: "Scan — MediaAuth" }],
  }),
  notFoundComponent: () => (
    <div className="mx-auto max-w-md py-20 text-center">
      <h2 className="font-display text-2xl font-semibold">Scan not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted or never existed.
      </p>
      <Link to="/scans" className="mt-4 inline-block text-sm text-primary hover:underline">
        ← Back to history
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md py-20 text-center text-destructive">{error.message}</div>
  ),
  component: ScanDetail,
});

function ScanDetail() {
  const { id } = Route.useParams();
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const rowQuery = useScanByIdQuery(id, !liveDemo);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>("");

  const debouncedDownload = useMemo(
    () =>
      debounce(
        async (scanId: string, title: string) => {
          setDownloadBusy(true);
          try {
            await downloadScanOriginal(scanId, title);
            toast.success("Download started");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Download failed");
          } finally {
            setDownloadBusy(false);
          }
        },
        800,
        { leading: true, trailing: false },
      ),
    [],
  );

  useEffect(() => {
    return () => {
      debouncedDownload.cancel();
    };
  }, [debouncedDownload]);

  const demoScan = useMemo(
    () => (liveDemo ? (demoScans.find((s) => s.id === id) ?? null) : null),
    [liveDemo, id],
  );

  const { scan, loading, notFound, loadError } = useMemo(() => {
    if (liveDemo) {
      return {
        scan: demoScan,
        loading: false,
        notFound: !demoScan,
        loadError: null as string | null,
      };
    }
    if (rowQuery.isPending) {
      return { scan: null, loading: true, notFound: false, loadError: null };
    }
    if (rowQuery.isError) {
      const msg = rowQuery.error.message;
      const nf =
        msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("scan not found");
      return { scan: null, loading: false, notFound: nf, loadError: nf ? null : msg };
    }
    return {
      scan: rowQuery.data ?? null,
      loading: false,
      notFound: false,
      loadError: null,
    };
  }, [liveDemo, demoScan, rowQuery.isPending, rowQuery.isError, rowQuery.error, rowQuery.data]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-3 py-16 text-center text-muted-foreground sm:px-4 sm:py-20 md:px-6">
        Loading scan…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-md px-3 py-16 text-center sm:px-4 sm:py-20 md:px-6">
        <h2 className="font-display text-2xl font-semibold">Could not load scan</h2>
        <p className="mt-2 text-sm text-destructive">{loadError}</p>
        <Link to="/scans" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to history
        </Link>
      </div>
    );
  }

  if (notFound || !scan) {
    return (
      <div className="mx-auto w-full max-w-md px-3 py-16 text-center sm:px-4 sm:py-20 md:px-6">
        <h2 className="font-display text-2xl font-semibold">Scan not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted or you may not have access.
        </p>
        <Link to="/scans" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Back to history
        </Link>
      </div>
    );
  }

  const uploadPreviewKind =
    !liveDemo && scan.canFetchMedia ? strictUploadPreviewKind(scan.mimeType) : undefined;

  const providerVM = adaptScanProviders(scan);
  const providerTabs = providerVM.tabs;
  const resolvedActiveProvider =
    providerTabs.length === 0
      ? ""
      : providerTabs.some((p) => p.id === activeProvider && providerVM.viewsById[p.id])
        ? activeProvider
        : providerVM.defaultProviderId;
  const activeProviderView = resolvedActiveProvider
    ? providerVM.viewsById[resolvedActiveProvider]
    : null;
  const activeProviderData = activeProviderView ? activeProviderView.rawOutput : null;
  const activeProviderMeta = providerTabs.find((p) => p.id === resolvedActiveProvider) || null;
  const isRealityDefenderProvider =
    resolvedActiveProvider.startsWith("reality_defender") ||
    resolvedActiveProvider.startsWith("real");
  const isHiveProvider = resolvedActiveProvider.startsWith("hive");
  const providerMetadata =
    activeProviderView?.metadata.map((m) => ({ key: m.label, value: m.value })) || [];
  const providerTimeline = activeProviderView?.timeline || [];
  const providerSignalGroups = activeProviderView?.signalGroups || [];
  const visibleHeatmaps = (() => {
    if (!activeProviderView) return [];
    const modelNames = new Set(
      (activeProviderView.modelInsights || []).map((m) => m.name).filter(Boolean),
    );
    return (activeProviderView.heatmaps || []).filter((h) => modelNames.has(h.modelName));
  })();
  const hiveMainSafe = isHiveProvider
    ? providerSignalGroups
      .flatMap((g) => g.signals)
      .filter((s) => s.tone === "success")
      .sort((a, b) => b.score - a.score)[0] || null
    : null;

  const verdictColor =
    scan.status === "safe"
      ? "from-success/30 to-success/0 ring-success/30 text-success"
      : scan.status === "flagged"
        ? "from-destructive/30 to-destructive/0 ring-destructive/40 text-destructive"
        : scan.status === "suspicious"
          ? "from-warning/30 to-warning/0 ring-warning/40 text-warning"
          : "from-primary/30 to-primary/0 ring-primary/40 text-primary";

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 overflow-x-hidden px-2 pb-28 sm:space-y-6 sm:px-4 sm:pb-12 md:px-6 md:pb-10">
      <div className="flex min-w-0 flex-row items-center justify-between gap-2 sm:gap-4">
        <Link
          to="/scans"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:flex-initial sm:max-w-none"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Back to history</span>
        </Link>
        <div className="flex shrink-0 flex-row items-center gap-2 sm:gap-2">
          <button
            type="button"
            aria-label="Share"
            className="inline-flex size-9 shrink-0 items-center justify-center gap-0 rounded-lg border border-border bg-card/60 text-sm hover:bg-card sm:h-9 sm:w-auto sm:min-w-0 sm:px-3 sm:gap-1.5"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Share</span>
          </button>
          <button
            type="button"
            aria-label="Export report"
            disabled={exportBusy}
            onClick={() => {
              void (async () => {
                if (!scan || exportBusy) {
                  return;
                }
                setExportBusy(true);
                try {
                  const { exportScanReportPdf } = await import("@/lib/export-scan-report-pdf");
                  await exportScanReportPdf(scan);
                  toast.success("Report exported");
                } catch {
                  toast.error("Export failed");
                } finally {
                  setExportBusy(false);
                }
              })();
            }}
            className="inline-flex size-9 shrink-0 items-center justify-center gap-0 rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] disabled:pointer-events-none disabled:opacity-60 sm:h-9 sm:w-auto sm:min-w-0 sm:px-3 sm:gap-1.5"
          >
            {exportBusy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="hidden sm:inline">Export report</span>
          </button>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br p-3 backdrop-blur-xl elevated ring-1 sm:p-4",
          verdictColor,
        )}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:justify-between">

          {/* LEFT CONTENT */}
          <div className="flex-1 min-w-0">
            <div className="mb-1.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={scan.status} />
                {/* retry + loading stays same */}
              </div>
            </div>

            {scan.rawStatus === "failed" && scan.lastError ? (
              <p className="mt-1 max-w-full break-words rounded-md bg-destructive/12 px-2 py-1 text-xs text-destructive ring-1 ring-destructive/30">
                {scan.lastError}
              </p>
            ) : null}

            <h1 className="mt-1 break-words font-display text-base font-semibold leading-tight sm:text-xl md:text-2xl">
              {scan.title}
            </h1>

            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Scanned {timeAgo(scan.createdAt)} · {scan.kind.toUpperCase()} ·{" "}
              {scan.modelCount ?? scan.detections.length} signals
            </p>
          </div>

          <div className="flex items-center justify-center md:justify-end md:pl-4">
          <ConfidenceRing value={scan.confidence} status={scan.status} />

          </div>

        </div>
      </motion.div>
      {/* <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br p-4 backdrop-blur-xl elevated ring-1 sm:p-6",
          verdictColor,
        )}
      >
        <div className="grid min-w-0 gap-4 sm:gap-6 md:grid-cols-[minmax(0,1fr),auto] md:items-center md:gap-6">
          <div className="min-w-0">
            <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={scan.status} />
                {scan.rawStatus === "failed" && (
                  <button
                    type="button"
                    disabled={retryBusy || liveDemo}
                    onClick={() => {
                      void (async () => {
                        if (retryBusy || liveDemo) return;
                        setRetryBusy(true);
                        try {
                          const response = await retryScanById(scan.id);
                          await Promise.all([
                            queryClient.invalidateQueries({ queryKey: scanKeys.all }),
                            queryClient.invalidateQueries({ queryKey: scanKeys.detail(scan.id) }),
                          ]);
                          toast.success("Retry queued");
                          await navigate({ to: "/scans/$id", params: { id: response.scan.id } });
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Retry failed");
                        } finally {
                          setRetryBusy(false);
                        }
                      })();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-warning/20 px-2.5 py-1.5 text-xs font-medium text-warning ring-1 ring-warning/30 transition hover:bg-warning/25 disabled:opacity-60"
                  >
                    {retryBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {retryBusy ? "Retrying..." : "Retry scan"}
                  </button>
                )}
                {!liveDemo && rowQuery.isRefetching && scan.status === "pending" && (
                  <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                    Checking for results…
                  </span>
                )}
              </div>
            </div>
            {scan.rawStatus === "failed" && scan.lastError ? (
              <p className="mt-1.5 max-w-full break-words rounded-md bg-destructive/12 px-2.5 py-1.5 text-xs text-destructive ring-1 ring-destructive/30">
                {scan.lastError}
              </p>
            ) : null}
            <h1 className="break-words font-display text-lg font-semibold leading-tight tracking-tight sm:text-2xl md:text-3xl">
              {scan.title}
            </h1>
            <p className="mt-1.5 max-w-full text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Scanned {timeAgo(scan.createdAt)} · {scan.kind.toUpperCase()} ·{" "}
              {scan.modelCount ?? scan.detections.length} signals
            </p>
          </div>
          <div className="flex justify-center pt-1 md:block md:justify-self-end md:pt-0">
            <div className="origin-center scale-[0.9] sm:scale-100">
              <ConfidenceRing value={scan.confidence} status={scan.status} />
            </div>
          </div>
        </div>
      </motion.div> */}

<div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl elevated sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Provider Results
            </div>
            <div className="text-sm text-muted-foreground">
              Switching providers updates all provider-specific sections below.
            </div>
          </div>
          {activeProviderMeta ? (
            <span
              className={cn(
                "rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1",
                providerExecutionStatusClass(activeProviderMeta.status),
              )}
            >
              {activeProviderMeta.status}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {providerTabs.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => setActiveProvider(provider.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
                resolvedActiveProvider === provider.id
                  ? "border-primary/60 bg-primary/15 text-foreground"
                  : "border-border bg-card/50 text-muted-foreground",
              )}
            >
              <span>{provider.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl elevated sm:p-5 lg:col-span-2"
        >
          <div className="mb-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Media preview
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {scan.status === "flagged" ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-destructive/20 px-2.5 py-1.5 text-xs text-destructive ring-1 ring-destructive/30 backdrop-blur">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">Likely AI-generated or manipulated</span>
                </div>
              ) : null}
            </div>

            {scan.canFetchMedia && !liveDemo ? (
              <button
                type="button"
                disabled={downloadBusy}
                aria-label="Download original"
                className="mobile-tap-fix inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70 text-foreground transition hover:bg-card disabled:opacity-60"
                onClick={() => debouncedDownload(scan.id, scan.title)}
              >
                {downloadBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
              </button>
            ) : null}
          </div>

          <div className="grid-bg relative aspect-video w-full max-w-full min-w-0 overflow-hidden rounded-xl bg-gradient-to-br from-muted/40 to-card ring-1 ring-border">
            <ScanMediaPreview
              scanId={scan.id}
              mimeType={scan.mimeType}
              previewUrl={scan.previewUrl}
              canFetchMedia={scan.canFetchMedia}
              mediaKind={scan.kind}
              liveDemo={liveDemo}
              uploadPreviewKind={uploadPreviewKind}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl elevated sm:p-5"
        >
          <div className="mb-3.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5 shrink-0" /> Signals
          </div>
          {providerTabs.length > 0 ? (
            <div className="space-y-3">
              {isHiveProvider ? (
                <div className="space-y-3">
                  {/* {hiveMainSafe ? (
                    <div className="rounded-md border border-success/40 bg-success/10 px-2.5 py-2 text-xs text-success">
                      <span className="font-semibold uppercase tracking-wide">Authentic</span>
                      <span className="ml-2">
                        {hiveMainSafe.label} ({hiveMainSafe.displayValue})
                      </span>
                    </div>
                  ) : null} */}
                  {providerSignalGroups.map((group) => (
                    <div key={group.id} className="space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </div>
                      <SignalList
                        detections={group.signals.map((s) => ({
                          label: s.label,
                          score: s.score,
                          tone: s.tone,
                        }))}
                      />
                    </div>
                  ))}
                  {providerSignalGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No data available for this provider
                    </p>
                  ) : null}
                </div>
              ) : isRealityDefenderProvider ? (
                providerSignalGroups.length > 0 ? (
                  <SignalList
                    detections={providerSignalGroups
                      .flatMap((g) => g.signals)
                      .map((s) => ({ label: s.label, score: s.score, tone: s.tone }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No data available for this provider
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">No data available for this provider</p>
              )}
            </div>
          ) : (
            <p className="max-w-full whitespace-normal break-words text-sm leading-relaxed text-muted-foreground">
              No model signals available for this scan.
            </p>
          )}
        </motion.div>
      </div>


      <div className="min-w-0 space-y-4 sm:space-y-4">
        <Accordion title="Metadata" icon={FileText} defaultOpen>
          {activeProviderView?.sections.showMetadata && providerMetadata.length > 0 ? (
            <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
              {providerMetadata.map((m) => (
                <div
                  key={m.key}
                  className="min-w-0 rounded-lg border border-border bg-input/30 px-3 py-2"
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {m.key}
                  </dt>
                  <dd className="mt-0.5 break-words font-mono text-xs sm:text-sm">{m.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
        <Accordion title="Model insights" icon={ListChecks}>
          {activeProviderView?.sections.showModelInsights &&
            activeProviderView.modelInsights &&
            activeProviderView.modelInsights.length > 0 ? (
            <div className="space-y-3">
              {activeProviderView.modelInsights.map((model, index) => {
                const percent =
                  typeof model.normalizedScore === "number"
                    ? model.normalizedScore
                    : typeof model.finalScore === "number"
                      ? model.finalScore
                      : typeof model.score === "number"
                        ? formatMaybePercent(model.score)
                        : null;

                return (
                  <div
                    key={`${model.name || "model"}-${index}`}
                    className="rounded-lg border border-border bg-input/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="break-words font-medium">
                          {model.name || "Unknown model"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {model.status || "—"}
                          {model.decision ? ` · ${model.decision}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 font-mono text-sm">
                        {percent != null ? `${percent}%` : "—"}
                      </div>
                    </div>

                    {percent != null ? (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            percent > 70
                              ? "bg-gradient-to-r from-destructive to-destructive/80"
                              : percent > 40
                                ? "bg-gradient-to-r from-warning to-warning/80"
                                : "bg-gradient-to-r from-success to-success/80",
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Score
                        </div>
                        <div className="font-mono text-xs">
                          {typeof model.score === "number" ? model.score : "—"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Raw score
                        </div>
                        <div className="font-mono text-xs">
                          {typeof model.rawScore === "number" ? model.rawScore : "—"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Decision
                        </div>
                        <div className="font-mono text-xs">{model.decision || "—"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
        <Accordion title="Provider execution" icon={Activity}>
          {activeProviderMeta ? (
            <ul className="space-y-2">
              <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-input/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{activeProviderMeta.name}</div>
                  <div className="text-xs text-muted-foreground">{activeProviderMeta.id}</div>
                </div>
                <span
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1",
                    providerExecutionStatusClass(activeProviderMeta.status),
                  )}
                >
                  {activeProviderMeta.status}
                </span>
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No provider execution data available.</p>
          )}
        </Accordion>

        <Accordion title="Heatmaps" icon={Activity}>
          {activeProviderView?.sections.showHeatmaps && visibleHeatmaps.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleHeatmaps.map((heatmap) => (
                <ResolvedHeatmapTile key={heatmap.modelName} scanId={id} heatmap={heatmap} />
              ))}
            </div>
          ) : activeProviderView?.sections.showHeatmaps && scan.heatmapsExpired ? (
            <p className="text-sm text-muted-foreground">
              Heatmap previews are no longer available (secure vendor links expired). New scans
              store heatmaps in MediaAuth so previews keep working.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
        <Accordion title="Analysis artifacts" icon={FileText}>
          {activeProviderView?.sections.showArtifacts ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-input/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Aggregation JSON
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Combined analysis output from the detection pipeline.
                </p>
                {scan.artifactAggregationAvailable ? (
                  <ArtifactViewButton
                    scanId={id}
                    artifactType="aggregation"
                    label="View artifact"
                  />
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">Not available</div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-input/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Model metadata
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Provider metadata and model-level artifact output.
                </p>
                {scan.artifactModelMetadataAvailable ? (
                  <ArtifactViewButton
                    scanId={id}
                    artifactType="model-metadata"
                    label="View artifact"
                  />
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">Not available</div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
        <Accordion title="Timeline" icon={Activity}>
          {activeProviderView?.sections.showTimeline && providerTimeline.length > 0 ? (
            <ol className="relative min-w-0 space-y-3 border-l border-border/80 pl-5 sm:space-y-4 sm:pl-6">
              {providerTimeline.map((t, i) => (
                <li key={i} className="relative min-w-0 pr-1">
                  <span className="absolute -left-[22px] top-1.5 grid h-3 w-3 place-items-center sm:-left-[27px]">
                    <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
                  </span>
                  <div className="font-mono text-[10px] text-muted-foreground sm:text-xs">
                    {t.time}
                  </div>
                  <div className="break-words text-sm">{t.event}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
        <Accordion title="Attempt history" icon={ListChecks}>
          <div className="mb-2 text-xs text-muted-foreground">
            Total retries:{" "}
            <span className="font-medium text-foreground">{scan.retryCount ?? 0}</span>
          </div>
          {scan.attempts && scan.attempts.length > 0 ? (
            <ol className="space-y-2">
              {scan.attempts.map((attempt, idx, list) => {
                const latest = idx === list.length - 1;
                const attemptLabel = attempt.attemptNumber === 1 ? "Original" : "Retry";
                return (
                  <li
                    key={attempt.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                      latest
                        ? "border-primary/40 bg-primary/10 ring-1 ring-primary/25"
                        : "border-border bg-input/30",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">Attempt {attempt.attemptNumber}</div>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-border/70">
                          {attemptLabel}
                        </span>
                        {latest ? (
                          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                            Latest
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {attempt.createdAt ? timeAgo(attempt.createdAt) : "—"} · {attempt.status}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={toUiStatus(attempt.status)} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No attempts available.</p>
          )}
        </Accordion>
        <Accordion title="Raw output (JSON)" icon={FileText}>
          {activeProviderView?.sections.showRawOutput ? (
            <pre className="max-h-60 max-w-full overflow-x-auto overflow-y-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-[10px] leading-relaxed sm:max-h-72 sm:p-4 sm:text-xs">
              {JSON.stringify(activeProviderData || null, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
      </div>
    </div>
  );
}

function toUiStatus(rawStatus: string) {
  const s = String(rawStatus || "").toLowerCase();
  if (s === "completed") return "safe";
  if (s === "failed") return "suspicious";
  return "pending";
}

function providerExecutionStatusClass(status: "queued" | "processing" | "completed" | "failed") {
  if (status === "completed") return "bg-success/15 text-success ring-success/30";
  if (status === "failed") return "bg-destructive/15 text-destructive ring-destructive/30";
  if (status === "processing") return "bg-primary/15 text-primary ring-primary/30";
  return "bg-muted text-muted-foreground ring-border";
}

function SignalList({
  detections,
}: {
  detections: Array<{ label: string; score: number; tone?: string }>;
}) {
  return (
    <ul className="space-y-3 sm:space-y-4">
      {detections.map((d, i) => (
        <li key={`${d.label}-${i}`} className="min-w-0">
          <div className="mb-1 flex min-w-0 items-start justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 break-words capitalize">{d.label}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums">
              {formatScorePercentage(d.score)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${d.score * 100}%` }}
              transition={{
                duration: 0.7,
                delay: 0.1 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={cn("h-full rounded-full", signalBarClass(d))}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function signalBarClass(detection: { label: string; score: number; tone?: string }) {
  if (detection.tone === "success") return "bg-gradient-to-r from-success to-success/80";
  if (detection.tone === "danger") return "bg-gradient-to-r from-destructive to-destructive/80";
  if (detection.tone === "attribution") return "bg-gradient-to-r from-primary to-primary/80";
  if (detection.tone === "warning") return "bg-gradient-to-r from-warning to-warning/80";
  if (detection.score > 0.7) return "bg-gradient-to-r from-destructive to-destructive/80";
  if (detection.score > 0.4) return "bg-gradient-to-r from-warning to-warning/80";
  return "bg-gradient-to-r from-success to-success/80";
}

function ConfidenceRing({ value, status }: { value: number; status: string }) {
  /**
   * Ring sits near the viewBox edge so the inner opening is wide enough for "NN%" + label.
   * Stroke is centered on r, so inner radius = r − strokeWidth/2 — keep that comfortably above half the text block height.
   */
  const r = 39;
  const strokeWidth = 5;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const stroke =
    status === "safe"
      ? "var(--success)"
      : status === "flagged"
        ? "var(--destructive)"
        : status === "suspicious"
          ? "var(--warning)"
          : "var(--primary)";

  return (
    <div className="relative isolate flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center sm:h-32 sm:w-32">
      <svg
        className="pointer-events-none absolute inset-0 z-0 -rotate-90"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          className="fill-none stroke-muted"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 3px ${stroke})` }}
        />
      </svg>
      {/* Slight upward shift: two-line label reads visually centered in the ring hole; avoids bottom arc + glow overlap */}
      <div className="relative z-10 flex -translate-y-1 flex-col items-center justify-center gap-1 px-1 text-center sm:-translate-y-0.5">
        <div className="font-display text-xs font-semibold leading-none tabular-nums sm:text-2xl md:text-3xl">
          {value}%
        </div>
        <div className="mt-0.5 text-[8px] uppercase leading-tight tracking-wider text-muted-foreground sm:text-[10px]">
          confidence
        </div>
      </div>
    </div>
  );
}

function Accordion({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 sm:gap-3 sm:px-5 sm:py-4"
      >
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 break-words font-display text-sm font-semibold sm:text-base">
          {title}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="min-w-0 border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
