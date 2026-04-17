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
      <div className="mx-auto max-w-6xl py-20 text-center text-muted-foreground">Loading scan…</div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
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
      <div className="mx-auto max-w-md py-20 text-center">
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/scans"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to history
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm hover:bg-card"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]"
          >
            <Download className="h-4 w-4" /> Export report
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br p-6 backdrop-blur-xl elevated ring-1",
          verdictColor,
        )}
      >
        <div className="grid gap-6 md:grid-cols-[1fr,auto] md:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <StatusBadge status={scan.status} />
              <span className="font-mono text-xs text-muted-foreground">{scan.id}</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {scan.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scanned {timeAgo(scan.createdAt)} · {scan.kind.toUpperCase()} ·{" "}
              {scan.detections.length} signals
            </p>
          </div>
          <ConfidenceRing value={scan.confidence} status={scan.status} />
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl elevated lg:col-span-2"
        >
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Media preview
          </div>
          <div className="grid-bg relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-muted/40 to-card ring-1 ring-border">
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-card/80 ring-1 ring-border backdrop-blur">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mt-3 font-mono text-xs text-muted-foreground">{scan.title}</p>
              </div>
            </div>
            {scan.status === "flagged" && (
              <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md bg-destructive/20 px-2 py-1 text-xs text-destructive ring-1 ring-destructive/30 backdrop-blur">
                <AlertTriangle className="h-3 w-3" /> Manipulation detected
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl elevated"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Signals
          </div>
          {scan.detections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signals yet — analysis in progress.</p>
          ) : (
            <ul className="space-y-3">
              {scan.detections.map((d, i) => (
                <li key={d.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{d.label}</span>
                    <span className="font-mono text-xs">{Math.round(d.score * 100)}%</span>
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

      <div className="space-y-3">
        <Accordion title="Metadata" icon={FileText} defaultOpen>
          <dl className="grid gap-3 sm:grid-cols-2">
            {scan.metadata.map((m) => (
              <div key={m.key} className="rounded-lg border border-border bg-input/30 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.key}
                </dt>
                <dd className="mt-0.5 font-mono text-sm">{m.value}</dd>
              </div>
            ))}
          </dl>
        </Accordion>

        <Accordion title="Timeline" icon={Activity}>
          <ol className="relative space-y-4 border-l border-border/80 pl-6">
            {scan.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-1.5 grid h-3 w-3 place-items-center">
                  <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
                </span>
                <div className="font-mono text-xs text-muted-foreground">{t.time}</div>
                <div className="text-sm">{t.event}</div>
              </li>
            ))}
          </ol>
        </Accordion>

        <Accordion title="Raw output (JSON)" icon={FileText}>
          <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background/60 p-4 font-mono text-xs leading-relaxed">
            {JSON.stringify(scan, null, 2)}
          </pre>
        </Accordion>
      </div>
    </div>
  );
}

function ConfidenceRing({ value, status }: { value: number; status: string }) {
  const r = 36;
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
    <div className="relative grid h-32 w-32 place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="fill-none stroke-muted" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${stroke})` }}
        />
      </svg>
      <div className="text-center">
        <div className="font-display text-3xl font-semibold tabular-nums">{value}%</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">confidence</div>
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
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30"
      >
        <Icon className="h-4 w-4 text-primary" />
        <span className="flex-1 font-display text-base font-semibold">{title}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
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
            <div className="border-t border-border/60 px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
