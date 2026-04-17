import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, Filter, Inbox, ScanSearch, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ScanRow } from "@/components/dashboard/ScanRow";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import { EmptyState } from "@/components/ui-ext/EmptyState";
import { Shimmer } from "@/components/ui-ext/Skeleton";
import { useScanHistoryQuery } from "@/features/scan/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import type { ScanStatus } from "@/lib/mock-data";
import type { Scan } from "@/lib/mock-data";
import { scans as demoScans } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/scans/")({
  head: () => ({ meta: [{ title: "Scan history — MediaAuth" }] }),
  component: ScansList,
});

const filters: { label: string; value: ScanStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Authentic", value: "safe" },
  { label: "Suspicious", value: "suspicious" },
  { label: "Manipulated", value: "flagged" },
  { label: "Analyzing", value: "pending" },
];

function ScansList() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ScanStatus | "all">("all");
  const [loading, setLoading] = useState(false);
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const historyQuery = useScanHistoryQuery({ page: 1, limit: 50, enabled: !liveDemo });

  const scans: Scan[] = liveDemo ? demoScans : (historyQuery.data ?? []);
  const listLoading = liveDemo ? false : historyQuery.isPending;
  const listError = liveDemo ? null : historyQuery.isError ? historyQuery.error.message : null;

  const results = useMemo(() => {
    return scans.filter((s) => {
      const matchesQ = !q || s.title.toLowerCase().includes(q.toLowerCase()) || s.id.includes(q);
      const matchesF = filter === "all" || s.status === filter;
      return matchesQ && matchesF;
    });
  }, [q, filter, scans]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionHeader
        eyebrow="History"
        title="All scans"
        description={
          listError
            ? listError
            : liveDemo
              ? "Sample scan list for the live demo — not your account data."
              : "Search and filter every authenticity report from your MediaAuth API."
        }
        action={
          <Link
            to="/scan"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]"
          >
            <ScanSearch className="h-4 w-4" />
            New scan
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLoading(true);
              setTimeout(() => setLoading(false), 250);
            }}
            placeholder="Search by filename or scan ID…"
            className="h-10 w-full rounded-lg border border-border bg-input/60 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card/60 p-0.5 backdrop-blur-xl">
          {filters.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "relative whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-md bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-inset ring-primary/30"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{f.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" />
          More
        </button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur-xl">
        {listLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Shimmer className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Shimmer className="h-3 w-1/3 rounded" />
                  <Shimmer className="h-2.5 w-1/4 rounded" />
                </div>
                <Shimmer className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : loading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Shimmer className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Shimmer className="h-3 w-1/3 rounded" />
                  <Shimmer className="h-2.5 w-1/4 rounded" />
                </div>
                <Shimmer className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No scans match"
            description="Try a different search or clear the filter."
            action={
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
                className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
              >
                Reset filters
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-border/60">
            {results.map((s, i) => (
              <ScanRow key={s.id} scan={s} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
