import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { StatusBadge } from "@/components/ui-ext/StatusBadge";
import { useScanByIdQuery } from "@/features/scan/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import { scans as demoScans, timeAgo, type Scan } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

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

  const demoScan = useMemo(
    () => (liveDemo ? demoScans.find((s) => s.id === id) ?? null : null),
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
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("scan not found");
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

  const verdictColor =
    scan.status === "safe"
      ? "from-success/30 to-success/0 ring-success/30 text-success"
      : scan.status === "flagged"
        ? "from-destructive/30 to-destructive/0 ring-destructive/40 text-[oklch(0.85_0.2_22)]"
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
            className="inline-flex size-9 shrink-0 items-center justify-center gap-0 rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] sm:h-9 sm:w-auto sm:min-w-0 sm:px-3 sm:gap-1.5"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Export report</span>
          </button>
        </div>
      </div>

      <motion.div
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
                {!liveDemo && rowQuery.isRefetching && scan.status === "pending" && (
                  <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                    Checking for results…
                  </span>
                )}
              </div>
              {/* <span className="block w-full min-w-0 max-w-full break-all font-mono text-[11px] leading-snug text-muted-foreground/90 sm:inline sm:w-auto sm:text-xs">
                {scan.id}
              </span> */}
            </div>
            <h1 className="break-words font-display text-lg font-semibold leading-tight tracking-tight sm:text-2xl md:text-3xl">
              {scan.title}
            </h1>
            <p className="mt-1.5 max-w-full text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Scanned {timeAgo(scan.createdAt)} · {scan.kind.toUpperCase()} ·{" "}
              {scan.detections.length} signals
            </p>
          </div>
          <div className="flex justify-center pt-1 md:block md:justify-self-end md:pt-0">
            <div className="origin-center scale-[0.88] sm:scale-100">
              <ConfidenceRing value={scan.confidence} status={scan.status} />
            </div>
          </div>
        </div>
      </motion.div>

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
          <div className="grid-bg relative aspect-video w-full max-w-full min-w-0 overflow-hidden rounded-xl bg-gradient-to-br from-muted/40 to-card ring-1 ring-border">
            <div
              className={cn(
                "absolute inset-0 grid place-items-center px-3 pb-2",
                scan.status === "flagged" ? "pt-11 sm:pt-10" : "pt-2",
              )}
            >
              <div className="w-full max-w-full min-w-0 text-center">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-card/80 ring-1 ring-border backdrop-blur sm:h-14 sm:w-14">
                  <FileText className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
                </div>
                <p className="mt-2.5 break-words px-1 font-mono text-[11px] leading-snug text-muted-foreground sm:mt-3 sm:text-xs">
                  {scan.title}
                </p>
              </div>
            </div>
            {scan.status === "flagged" && (
              <div className="absolute left-2 right-2 top-2 flex max-w-none items-center gap-1.5 rounded-md bg-destructive/20 px-2 py-1.5 text-[10px] leading-tight text-destructive ring-1 ring-destructive/30 backdrop-blur sm:left-4 sm:right-auto sm:top-4 sm:text-xs">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="min-w-0 break-words">Manipulation detected</span>
              </div>
            )}
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
          {scan.detections.length === 0 ? (
            <p className="max-w-full whitespace-normal break-words text-sm leading-relaxed text-muted-foreground">
              No signals yet — analysis in progress.
            </p>
          ) : (
            <ul className="space-y-3 sm:space-y-4">
              {scan.detections.map((d, i) => (
                <li key={d.label} className="min-w-0">
                  <div className="mb-1 flex min-w-0 items-start justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 break-words">{d.label}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {Math.round(d.score * 100)}%
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
                      className={cn(
                        "h-full rounded-full",
                        d.score > 0.7
                          ? "bg-gradient-to-r from-destructive to-[oklch(0.78_0.2_22)]"
                          : d.score > 0.4
                            ? "bg-gradient-to-r from-warning to-[oklch(0.85_0.16_80)]"
                            : "bg-gradient-to-r from-success to-[oklch(0.85_0.17_155)]",
                      )}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      </div>

      <div className="min-w-0 space-y-4 sm:space-y-4">
        <Accordion title="Metadata" icon={FileText} defaultOpen>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
            {scan.metadata.map((m) => (
              <div key={m.key} className="min-w-0 rounded-lg border border-border bg-input/30 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.key}
                </dt>
                <dd className="mt-0.5 break-words font-mono text-xs sm:text-sm">{m.value}</dd>
              </div>
            ))}
          </dl>
        </Accordion>

        <Accordion title="Timeline" icon={Activity}>
          <ol className="relative min-w-0 space-y-3 border-l border-border/80 pl-5 sm:space-y-4 sm:pl-6">
            {scan.timeline.map((t, i) => (
              <li key={i} className="relative min-w-0 pr-1">
                <span className="absolute -left-[22px] top-1.5 grid h-3 w-3 place-items-center sm:-left-[27px]">
                  <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
                </span>
                <div className="font-mono text-[10px] text-muted-foreground sm:text-xs">{t.time}</div>
                <div className="break-words text-sm">{t.event}</div>
              </li>
            ))}
          </ol>
        </Accordion>

        <Accordion title="Raw output (JSON)" icon={FileText}>
          <pre className="max-h-60 max-w-full overflow-x-auto overflow-y-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-[10px] leading-relaxed sm:max-h-72 sm:p-4 sm:text-xs">
            {JSON.stringify(scan, null, 2)}
          </pre>
        </Accordion>
      </div>
    </div>
  );
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
        <circle cx="50" cy="50" r={r} className="fill-none stroke-muted" strokeWidth={strokeWidth} />
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
      <div className="relative z-10 flex -translate-y-1 flex-col items-center justify-center gap-0 px-1 text-center sm:-translate-y-0.5">
        <div className="font-display text-lg font-semibold leading-none tabular-nums sm:text-2xl md:text-3xl">{value}%</div>
        <div className="mt-0.5 text-[9px] uppercase leading-tight tracking-wider text-muted-foreground sm:text-[10px]">
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
        <span className="min-w-0 flex-1 break-words font-display text-sm font-semibold sm:text-base">{title}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
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
            <div className="min-w-0 border-t border-border/60 px-4 py-3 sm:px-5 sm:py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
