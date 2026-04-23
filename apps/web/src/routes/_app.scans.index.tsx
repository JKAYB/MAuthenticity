import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Inbox, ScanSearch, Search } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ScanRow } from "@/components/dashboard/ScanRow";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import { EmptyState } from "@/components/ui-ext/EmptyState";
import { Shimmer } from "@/components/ui-ext/Skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScanHistoryQuery } from "@/features/scan/hooks";
import { getLiveDemoSnapshot, subscribeLiveDemo } from "@/lib/demo-mode";
import type { ScanHistoryResultFilter } from "@/lib/api";
import type { NormalizedMediaType, Scan, ScanStatus } from "@/lib/mock-data";
import { scans as demoScans } from "@/lib/mock-data";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type ScansHistorySearch = {
  q?: string;
  mediaType?: NormalizedMediaType;
  result?: ScanHistoryResultFilter;
  page?: number;
};

const HISTORY_MEDIA_VALUES: readonly NormalizedMediaType[] = [
  "image",
  "video",
  "audio",
  "document",
  "other",
];

const HISTORY_RESULT_VALUES: readonly ScanHistoryResultFilter[] = [
  "authentic",
  "suspicious",
  "manipulated",
  "analyzing",
  "failed",
];

function parseHistoryMediaType(raw: unknown): NormalizedMediaType | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase() as NormalizedMediaType;
  return HISTORY_MEDIA_VALUES.includes(v) ? v : undefined;
}

function parseHistoryResult(raw: unknown): ScanHistoryResultFilter | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  return HISTORY_RESULT_VALUES.includes(v as ScanHistoryResultFilter)
    ? (v as ScanHistoryResultFilter)
    : undefined;
}

function parseHistoryPage(raw: unknown): number | undefined {
  const n =
    typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n < 2 || n > 5000) return undefined;
  return Math.floor(n);
}

export const Route = createFileRoute("/_app/scans/")({
  validateSearch: (raw: Record<string, unknown>): ScansHistorySearch => {
    const out: ScansHistorySearch = {};
    if (typeof raw.q === "string" && raw.q.trim()) {
      out.q = raw.q.trim().slice(0, 200);
    }
    const mt = parseHistoryMediaType(raw.mediaType);
    if (mt) out.mediaType = mt;
    const res = parseHistoryResult(raw.result);
    if (res) out.result = res;
    const page = parseHistoryPage(raw.page);
    if (page != null) out.page = page;
    return out;
  },
  head: () => ({ meta: [{ title: "Scan history — Observyx" }] }),
  component: ScansList,
});

const FILE_TYPE_OPTIONS: { label: string; value: "all" | NormalizedMediaType }[] = [
  { label: "All", value: "all" },
  { label: "Images", value: "image" },
  { label: "Videos", value: "video" },
  { label: "Audio", value: "audio" },
  { label: "Documents", value: "document" },
  { label: "Other", value: "other" },
];

const RESULT_OPTIONS: { label: string; value: "all" | ScanHistoryResultFilter }[] = [
  { label: "All", value: "all" },
  { label: "Authentic", value: "authentic" },
  { label: "Suspicious", value: "suspicious" },
  { label: "Manipulated", value: "manipulated" },
  { label: "Analyzing", value: "analyzing" },
  { label: "Failed", value: "failed" },
];

function demoResultMatchesFilter(
  scan: Scan,
  resultFilter: "all" | ScanHistoryResultFilter,
): boolean {
  if (resultFilter === "all") return true;
  if (resultFilter === "failed") {
    return scan.rawStatus === "failed";
  }
  const statusToFilter: Record<Exclude<ScanHistoryResultFilter, "failed">, ScanStatus> = {
    authentic: "safe",
    suspicious: "suspicious",
    manipulated: "flagged",
    analyzing: "pending",
  };
  return scan.status === statusToFilter[resultFilter];
}

/** Demo rows may omit `mediaType`; infer from MIME / kind like the API. */
function demoNormalizedMediaType(scan: Scan): NormalizedMediaType {
  if (scan.mediaType) return scan.mediaType;
  const m = String(scan.mimeType || "")
    .trim()
    .toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (
    m === "application/pdf" ||
    m.startsWith("text/") ||
    m.includes("msword") ||
    m.includes("wordprocessingml")
  ) {
    return "document";
  }
  if (scan.kind === "image") return "image";
  if (scan.kind === "video") return "video";
  if (scan.kind === "audio") return "audio";
  return "other";
}

function buildScansSearch(args: {
  q: string;
  mediaType: "all" | NormalizedMediaType;
  resultFilter: "all" | ScanHistoryResultFilter;
  page: number;
}): ScansHistorySearch {
  const s: ScansHistorySearch = {};
  const qt = args.q.trim();
  if (qt) s.q = qt.slice(0, 200);
  if (args.mediaType !== "all") s.mediaType = args.mediaType;
  if (args.resultFilter !== "all") s.result = args.resultFilter;
  if (args.page > 1) s.page = args.page;
  return s;
}

/** Radix SelectTrigger: match history search inputs + design tokens. */
const historySelectTriggerClass =
  "h-10 min-w-0 w-full rounded-lg border border-border bg-input/60 px-3 py-2 text-sm text-foreground shadow-sm transition-colors hover:border-border/80 hover:bg-input/80 focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:text-foreground";

function ScansList() {
  const navigate = useNavigate({ from: Route.id });
  const search = Route.useSearch();
  const [draftQ, setDraftQ] = useState(() => search.q ?? "");
  const debouncedQ = useDebouncedValue(draftQ, 400);
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);

  const fileType = search.mediaType ?? "all";
  const resultFilter = search.result ?? "all";
  const page = search.page ?? 1;
  const limit = 10;

  useEffect(() => {
    setDraftQ(search.q ?? "");
  }, [search.q]);

  useEffect(() => {
    const trimmed = debouncedQ.trim();
    const urlQ = (search.q ?? "").trim();
    if (trimmed === urlQ) return;
    navigate({
      to: "/scans",
      search: buildScansSearch({
        q: trimmed,
        mediaType: search.mediaType ? search.mediaType : "all",
        resultFilter: search.result ? search.result : "all",
        page: 1,
      }),
      replace: true,
    });
  }, [debouncedQ, navigate, search.mediaType, search.q, search.result]);

  const historyQuery = useScanHistoryQuery({
    page,
    limit,
    mediaType: fileType === "all" ? undefined : fileType,
    result: resultFilter === "all" ? undefined : resultFilter,
    q: debouncedQ.trim() || undefined,
    enabled: !liveDemo,
  });

  const listLoading = liveDemo ? false : historyQuery.isPending;
  const listError = liveDemo ? null : historyQuery.isError ? historyQuery.error.message : null;

  const scans = useMemo((): Scan[] => {
    if (liveDemo) {
      return demoScans.filter((s) => {
        const mediaOk = fileType === "all" || demoNormalizedMediaType(s) === fileType;
        const resultOk = demoResultMatchesFilter(s, resultFilter);
        const dq = debouncedQ.trim().toLowerCase();
        const queryOk =
          !dq || s.title.toLowerCase().includes(dq) || s.id.toLowerCase().includes(dq);
        return mediaOk && resultOk && queryOk;
      });
    }
    return historyQuery.data ?? [];
  }, [liveDemo, fileType, resultFilter, debouncedQ, historyQuery.data]);

  const pageNum = search.page ?? 1;
  const hasActiveFilters = Boolean(
    draftQ.trim() || search.mediaType || search.result || pageNum > 1,
  );

  const clearAll = () => {
    setDraftQ("");
    navigate({ to: "/scans", search: {}, replace: true });
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 overflow-x-hidden sm:space-y-6">
      <SectionHeader
        eyebrow="History"
        title="All scans"
        description={
          listError
            ? listError
            : liveDemo
              ? "Sample scan list for the live demo — not your account data."
              : "Search and filter every authenticity report from your Observyx API."
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

      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search by filename (updates after you pause typing)"
            aria-label="Search scans by filename"
            className="h-10 w-full min-w-0 rounded-lg border border-border bg-input/60 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className="text-xs font-medium text-muted-foreground"
              id="scans-filter-file-type-label"
            >
              File type
            </span>
            <Select
              value={fileType}
              onValueChange={(v) => {
                const next = v as "all" | NormalizedMediaType;
                navigate({
                  to: "/scans",
                  search: buildScansSearch({
                    q: debouncedQ.trim(),
                    mediaType: next,
                    resultFilter: search.result ? search.result : "all",
                    page: 1,
                  }),
                  replace: true,
                });
              }}
            >
              <SelectTrigger
                aria-labelledby="scans-filter-file-type-label"
                className={historySelectTriggerClass}
              >
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover text-popover-foreground">
                {FILE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="rounded-md">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className="text-xs font-medium text-muted-foreground"
              id="scans-filter-result-label"
            >
              Scan result
            </span>
            <Select
              value={resultFilter}
              onValueChange={(v) => {
                const next = v as "all" | ScanHistoryResultFilter;
                navigate({
                  to: "/scans",
                  search: buildScansSearch({
                    q: debouncedQ.trim(),
                    mediaType: search.mediaType ? search.mediaType : "all",
                    resultFilter: next,
                    page: 1,
                  }),
                  replace: true,
                });
              }}
            >
              <SelectTrigger
                aria-labelledby="scans-filter-result-label"
                className={historySelectTriggerClass}
              >
                <SelectValue placeholder="All results" />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover text-popover-foreground">
                {RESULT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="rounded-md">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasActiveFilters && scans.length > 0 && !listLoading ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => clearAll()}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Clear filters
            </button>
          </div>
        ) : null}
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
        ) : scans.length === 0 ? (
          <div className="p-6 sm:p-8">
            <EmptyState
              icon={Inbox}
              title={hasActiveFilters ? "No scans match your filters" : "No scans yet"}
              description={
                hasActiveFilters
                  ? "Nothing in your history matches the current search or filters. Try clearing them or broadening your search."
                  : "Run your first scan to see it listed here."
              }
              action={
                hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => clearAll()}
                    className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                  >
                    Clear filters
                  </button>
                ) : (
                  <Link
                    to="/scan"
                    className="inline-flex h-9 items-center rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground"
                  >
                    New scan
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {scans.map((s, i) => (
              <ScanRow key={s.id} scan={s} index={i} />
            ))}
          </div>
        )}
      </div>

      {!liveDemo && !listLoading && !listError ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Page {historyQuery.data ? page : 1}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                navigate({
                  to: "/scans",
                  search: buildScansSearch({
                    q: debouncedQ.trim(),
                    mediaType: search.mediaType ? search.mediaType : "all",
                    resultFilter: search.result ? search.result : "all",
                    page: Math.max(1, page - 1),
                  }),
                  replace: true,
                })
              }
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={Boolean(historyQuery.data && historyQuery.data.length < limit)}
              onClick={() =>
                navigate({
                  to: "/scans",
                  search: buildScansSearch({
                    q: debouncedQ.trim(),
                    mediaType: search.mediaType ? search.mediaType : "all",
                    resultFilter: search.result ? search.result : "all",
                    page: page + 1,
                  }),
                  replace: true,
                })
              }
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
