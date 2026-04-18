import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ScanSearch, ShieldCheck, ShieldAlert, Activity, Gauge, Inbox } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { ScanRow } from "@/components/dashboard/ScanRow";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import { EmptyState } from "@/components/ui-ext/EmptyState";
import { useMe } from "@/features/auth/hooks";
import { useScanHistoryQuery } from "@/features/scan/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import type { Scan } from "@/lib/mock-data";
import { metrics as demoMetrics, scans as demoScans, user as demoUser } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — MediaAuth" }] }),
  component: Dashboard,
});

const icons = [ShieldCheck, ShieldAlert, Gauge, Activity];

const emptyLiveMetrics = [
  { label: "Total scans", value: 0, delta: "—", trend: "up" as const },
  { label: "Completed", value: 0, delta: "—", trend: "up" as const },
  { label: "Pending", value: 0, delta: "—", trend: "down" as const },
  { label: "Flagged", value: 0, delta: "—", trend: "up" as const },
];

function Dashboard() {
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const meQuery = useMe();
  const historyQuery = useScanHistoryQuery({ page: 1, limit: 10, enabled: !liveDemo });

  const scans: Scan[] = useMemo(
    () => (liveDemo ? demoScans.slice(0, 5) : (historyQuery.data ?? [])),
    [liveDemo, historyQuery.data],
  );
  const loading = liveDemo ? false : historyQuery.isPending;
  const error = liveDemo ? null : historyQuery.isError ? historyQuery.error.message : null;

  const recent = scans.slice(0, 5);

  const liveMetrics = useMemo(() => {
    const total = scans.length;
    const completed = scans.filter((s) => s.status !== "pending").length;
    const flagged = scans.filter((s) => s.status === "flagged").length;
    const pending = scans.filter((s) => s.status === "pending").length;
    return [
      { label: "Total scans", value: total, delta: "live", trend: "up" as const },
      { label: "Completed", value: completed, delta: "live", trend: "up" as const },
      { label: "Pending", value: pending, delta: "live", trend: "down" as const },
      { label: "Flagged", value: flagged, delta: "live", trend: "up" as const },
    ];
  }, [scans]);

  const displayMetrics = liveDemo
    ? demoMetrics
    : loading
      ? emptyLiveMetrics
      : scans.length
        ? liveMetrics
        : emptyLiveMetrics;

  const orgEyebrow = liveDemo
    ? `${demoUser.org} · ${demoUser.plan}`
    : meQuery.isSuccess && meQuery.data
      ? `${meQuery.data.organization?.trim() || "Workspace"} · ${meQuery.data.plan}`
      : loading || meQuery.isPending
        ? "Loading workspace…"
        : "Workspace";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl elevated sm:p-8"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              {orgEyebrow}
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {liveDemo ? "Welcome to the demo." : "Welcome back."}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              {liveDemo ? (
                "Sample workspace data below — use Exit demo in the banner to return to your account."
              ) : error ? (
                <span className="text-destructive">{error}</span>
              ) : loading ? (
                "Loading your latest scan activity…"
              ) : (
                `You have ${scans.length} scan${scans.length === 1 ? "" : "s"} in this session. Metrics below reflect your account when data is available.`
              )}
            </p>
          </div>
          <Link
            to="/scan"
            className="group inline-flex h-11 items-center gap-2 self-start rounded-lg bg-gradient-to-br from-primary to-accent px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition hover:scale-[1.02]"
          >
            <ScanSearch className="h-4 w-4" />
            Run new scan
          </Link>
        </div>
      </motion.section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {displayMetrics.map((m, i) => (
          <MetricCard key={m.label} {...m} index={i} icon={icons[i]} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl elevated lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last 14 days
              </div>
              <div className="mt-0.5 font-display text-xl font-semibold">Scan activity</div>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-input/40 p-0.5 text-xs">
              {["7d", "14d", "30d"].map((p, i) => (
                <button
                  key={p}
                  type="button"
                  className={
                    i === 1
                      ? "rounded-md bg-card px-2.5 py-1 font-medium ring-1 ring-border"
                      : "px-2.5 py-1 text-muted-foreground hover:text-foreground"
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ActivityChart />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl elevated"
        >
          <div className="mb-4 font-display text-xl font-semibold">Detection mix</div>
          <div className="space-y-3">
            {[
              { l: "Authentic", v: 78, c: "from-success to-success/60" },
              { l: "Suspicious", v: 14, c: "from-warning to-warning/60" },
              { l: "Manipulated", v: 8, c: "from-destructive to-destructive/60" },
            ].map((r, i) => (
              <div key={r.l}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.l}</span>
                  <span className="font-mono">{r.v}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${r.v}%` }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full bg-gradient-to-r ${r.c}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Activity"
          title="Recent scans"
          description={
            liveDemo
              ? "Sample reports for the live demo — not from your API."
              : "Your most recent authenticity reports from the API."
          }
          action={
            <Link to="/scans" className="text-sm font-medium text-primary hover:underline">
              View all →
            </Link>
          }
        />
        <div className="rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur-xl">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Loading scans…
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No scans yet"
              description="Run your first scan to see results here."
              action={
                <Link
                  to="/scan"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  <ScanSearch className="h-3.5 w-3.5" />
                  New scan
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border/60">
              {recent.map((s, i) => (
                <ScanRow key={s.id} scan={s} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
