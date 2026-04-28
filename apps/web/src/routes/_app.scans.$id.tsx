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
import { useMe } from "@/features/auth/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import { scans as demoScans, timeAgo, type Scan } from "@/lib/mock-data";
import { downloadScanOriginal } from "@/lib/scan-media-download";
import { strictUploadPreviewKind } from "@/lib/scan-media";
import { cn } from "@/lib/utils";
import { debounce } from "lodash";
import { ResolvedHeatmapTile } from "@/components/scan/ResolvedHeatmapTile";
import { ArtifactViewButton } from "@/components/scan/ArtifactViewButton";
import { formatMaybePercent, formatScorePercentage } from "@/lib/percentage";
import { adaptScanProviders } from "@/features/scans/adapters/adaptScanProviders";
import { aggregateScanResult } from "@/features/scans/adapters/aggregateScanResult";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";

export const Route = createFileRoute("/_app/scans/$id")({
  head: () => ({
    meta: [{ title: "Scan — MAuthenticity" }],
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
  const meQuery = useMe();
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
  const aggregated = aggregateScanResult(scan);
  const canDownloadReports = liveDemo || (meQuery.data?.access?.has_paid_history ?? false);
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
  const aggregatedStatus =
    aggregated.verdict === "authentic"
      ? "safe"
      : aggregated.verdict === "manipulated"
        ? "flagged"
        : aggregated.verdict === "suspicious"
          ? "suspicious"
          : "pending";
  const isInconclusive = aggregated.verdict === "inconclusive";
  const topSummary = isInconclusive
    ? "We could not verify this media due to insufficient detection data."
    : aggregated.summary;

  const verdictColor =
    aggregatedStatus === "safe"
      ? "from-success/30 to-success/0 ring-success/30 text-success"
      : aggregatedStatus === "flagged"
        ? "from-destructive/30 to-destructive/0 ring-destructive/40 text-destructive"
        : aggregatedStatus === "suspicious"
          ? "from-warning/30 to-warning/0 ring-warning/40 text-warning"
          : "from-primary/30 to-primary/0 ring-primary/40 text-primary";

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 overflow-x-hidden px-2 pb-28 sm:space-y-6 sm:px-4 sm:pb-12 md:px-6 md:pb-10">
      <SectionHeader
        title="Scan Details"
        description={
          "View the details of the scan."
        }
      />
      {/* <div className="flex min-w-0 flex-row items-center justify-between gap-2 sm:gap-4">
        <Link
          to="/scans"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:flex-initial sm:max-w-none"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">Back to history</span>
        </Link>
      </div> */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br p-2 backdrop-blur-xl elevated ring-1 sm:p-4",
          verdictColor, // Ensure this applies the subtle green/dark gradient from the design
        )}
      >
        <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
          {/* Primary Visual: Confidence Ring moved to the start */}
          <div className="flex shrink-0 items-center justify-center">
            <ConfidenceRing
              value={aggregated.confidence}
              status={aggregatedStatus} />
          </div>

          {/* Content Section */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="font-display text-lg font-bold tracking-tight leading-snug break-all overflow-hidden sm:text-3xl md:text-4xl">
              {scan.title}
            </h1>

            <p className="mt-1.5 max-w-full text-xs leading-relaxed opacity-90 sm:mt-2 sm:max-w-2xl sm:text-sm">
              {topSummary}
            </p>

            {/* Simplified Metadata Row with Icons */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm font-medium opacity-70 md:justify-start">
              <span>{timeAgo(scan.createdAt)}</span>
              <span className="h-1 w-1 rounded-full bg-current opacity-40" />
              <div className="flex items-center gap-1.5">
                {/* Add a simple Image Icon here if available */}
                <span className="uppercase tracking-wider">{scan.kind}</span>
              </div>
              <span className="h-1 w-1 rounded-full bg-current opacity-40" />
              <div className="flex items-center gap-1.5">
                {/* Add a Signal Icon here */}
                <span>{aggregated.topSignals.length} Signals</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 self-start items-center justify-end gap-2">
            <button
              type="button"
              aria-label="Share"
              title="Share"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/60 text-sm hover:bg-card sm:w-auto sm:px-3"
            >
              <Share2 className="h-4 w-4 shrink-0" aria-hidden />
            </button>

            <button
              type="button"
              aria-label="Export report"
              disabled={exportBusy}
              title={canDownloadReports ? "Export report" : "Upgrade required to download reports"}
              onClick={() => {
                void (async () => {
                  if (!scan || exportBusy) return;

                  if (!canDownloadReports) {
                    toast.error("Report download requires a paid plan");
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
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/60 text-sm hover:bg-card disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-3"
            >
              {exportBusy ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4 shrink-0" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </motion.div>
      {!isInconclusive ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl elevated sm:p-5">
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
              How this result was determined
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This verdict is based on combined analysis from multiple detection providers, evaluating signals of AI generation and manipulation.
            </p>
          </div>

          <div className="flex items-center justify-start text-xs py-2">
            <span className="font-semibold text-xs tracking-wide text-muted-foreground">
              Provider Agreement -
            </span>

            <span
              className={cn(
                "pl-2 font-bold capitalize",
                aggregated.agreement === "strong"
                  ? "text-success"
                  : aggregated.agreement === "mixed"
                    ? "text-warning"
                    : "text-primary"
              )}
            >
              {aggregated.agreement === "strong"
                ? "Strong"
                : aggregated.agreement === "mixed"
                  ? "Mixed"
                  : "Single"}
            </span>
          </div>

          <div className="space-y-2">
            {aggregated.providerFindings.map((p) => (
              <div
                key={p.providerId}
                className="rounded-lg border border-border bg-background/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    Provider - {p.providerName}
                  </div>

                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                      p.verdict === "authentic"
                        ? "bg-success/15 text-success"
                        : p.verdict === "suspicious"
                          ? "bg-warning/15 text-warning"
                          : p.verdict === "manipulated"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                    )}
                  >
                    {p.verdict}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-1 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-x-4">
                  <div>
                    AI/manipulation signal:{" "}
                    <span className="font-medium text-foreground">{p.aiScore}%</span>
                  </div>

                  <div>
                    Authenticity indication:{" "}
                    <span className="font-medium text-foreground">{p.authenticScore}%</span>
                  </div>
                </div>
                {/* 
                <div className="mt-1 text-xs text-muted-foreground">
                  AI/manipulation signal:{" "}
                  <span className="font-medium text-foreground">{p.aiScore}%</span>
                  Authenticity indication:{" "}
                  <span className="font-medium text-foreground">{p.authenticScore}%</span>
                </div> */}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="min-w-0 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl elevated sm:p-5 lg:col-span-2"
        >
          {/* <div className="mb-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Media preview
          </div> */}

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Media preview
            </div>
            <div className="min-w-0">
              {aggregated.verdict === "manipulated" ? (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-destructive/20 px-2.5 py-1.5 text-xs text-destructive ring-1 ring-destructive/30 backdrop-blur">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">Likely AI-generated or manipulated</span>
                </div>
              ) : null}
            </div>

            {scan.canFetchMedia && !liveDemo ? (
              <button
                type="button"
                disabled={downloadBusy || !canDownloadReports}
                aria-label="Download original"
                title={canDownloadReports ? "Download original" : "Upgrade required to download reports"}
                className="mobile-tap-fix inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70 text-foreground transition hover:bg-card disabled:opacity-60"
                onClick={() => {
                  if (!canDownloadReports) {
                    toast.error("Report download requires a paid plan");
                    return;
                  }
                  debouncedDownload(scan.id, scan.title);
                }}
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
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5 shrink-0" />
            Advanced signals
          </div>

          {aggregated.topSignals.length > 0 ? (
            <>
              <div className="space-y-3  max-h-90 overflow-y-auto p-3 border rounded-lg">
                {aggregated.topSignals.map((s, i) => (
                  <div
                    key={`${s.providerId}-${s.label}-${i}`}
                    className="rounded-lg border border-border bg-background/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 break-words text-sm font-medium text-foreground">
                        {s.label}
                      </div>

                      <div className="shrink-0 font-mono text-xs text-muted-foreground">
                        {s.score}%
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${s.score}%` }}
                      />
                    </div>

                    <div className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {s.severity === "high"
                        ? "High model response"
                        : s.severity === "medium"
                          ? "Moderate model response"
                          : "Low model response"}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                These signals show how strongly each model responded. They do not indicate risk on their own or override the final aggregated result.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No advanced signals available.
            </p>
          )}
        </motion.div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl elevated sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Provider Results
            </div>
            <div className="text-xs text-muted-foreground">
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
      <div className="min-w-0 space-y-4 sm:space-y-4">
        <Accordion title="Provider signals" icon={ListChecks} defaultOpen>
          {providerSignalGroups.length > 0 ? (
            <div className="space-y-3">
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
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not available for this provider</p>
          )}
        </Accordion>
        <Accordion title="Metadata" icon={FileText}>
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
              store heatmaps in MAuthenticity so previews keep working.
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
                      "rounded-md border px-3 py-2",
                      latest
                        ? "border-primary/40 bg-primary/10 ring-1 ring-primary/25"
                        : "border-border bg-input/30",
                    )}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium">
                            Attempt {attempt.attemptNumber}
                          </div>

                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-border/70">
                            {attemptLabel}
                          </span>

                          {latest ? (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                              Latest
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 break-words text-xs text-muted-foreground">
                          {attempt.createdAt ? timeAgo(attempt.createdAt) : "—"} · {attempt.status}
                        </div>
                      </div>

                      <div className="self-start sm:shrink-0">
                        <StatusBadge status={toUiStatus(attempt.status)} />
                      </div>
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
  if (s === "failed") return "failed";
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
