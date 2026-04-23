import type { Scan, ScanModelInsight } from "@/lib/mock-data";
import { adaptHiveProvider } from "@/features/scans/adapters/adaptHiveProvider";
import { adaptRealityDefenderProvider } from "@/features/scans/adapters/adaptRealityDefenderProvider";
import { formatMaybePercent } from "@/lib/percentage";

/** Normalize string for provider id matching. */
function normalizeProviderId(id: string): string {
  const n = String(id || "")
    .trim()
    .toLowerCase();
  return n === "real" ? "reality_defender" : n;
}

type ScanPayloadExtensions = Scan & {
  providerResult?: unknown;
  providers?: unknown;
};

function processorsFromPayloadRoot(root: unknown): Record<string, unknown> | null {
  if (!isRecord(root)) return null;
  const procs = root.processors;
  return procs && typeof procs === "object" && !Array.isArray(procs)
    ? (procs as Record<string, unknown>)
    : null;
}

function getProcessorsRecord(scan: Scan): Record<string, unknown> | null {
  const fromResult = processorsFromPayloadRoot(scan.resultPayload);
  if (fromResult) return fromResult;

  const ext = scan as ScanPayloadExtensions;
  const fromProviderResult = processorsFromPayloadRoot(ext.providerResult);
  if (fromProviderResult) return fromProviderResult;

  const prov = ext.providers;
  if (isRecord(prov)) {
    const nested = processorsFromPayloadRoot(prov);
    if (nested) return nested;
  }
  return null;
}

function getProviderProcessor(scan: Scan, canonicalId: "hive" | "reality_defender"): unknown {
  const procs = getProcessorsRecord(scan);
  if (!procs) return null;
  if (canonicalId === "hive") {
    return procs.hive ?? null;
  }
  if ("reality_defender" in procs) return procs.reality_defender;
  if ("real" in procs) return procs.real;
  return null;
}

function providerExecutionStatus(
  scan: Scan,
  canonicalId: "hive" | "reality_defender",
): "queued" | "processing" | "completed" | "failed" | null {
  const match = scan.providerExecution?.find((p) => normalizeProviderId(p.id) === canonicalId);
  return match?.status ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Safe display for PDF cells (no crashes on odd shapes).
 */
export function toDisplay(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 2000 ? `${s.slice(0, 1997)}…` : s;
    } catch {
      return "[object]";
    }
  }
  return "—";
}

function safeJsonSnippet(value: unknown, maxLen = 1800): string {
  try {
    const s = JSON.stringify(value, null, 0);
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  } catch {
    return "—";
  }
}

function pickModelScorePercent(m: ScanModelInsight): string {
  if (typeof m.normalizedScore === "number" && Number.isFinite(m.normalizedScore)) {
    return `${Math.floor(m.normalizedScore)}%`;
  }
  if (typeof m.finalScore === "number" && Number.isFinite(m.finalScore)) {
    return `${Math.floor(m.finalScore)}%`;
  }
  if (typeof m.score === "number" && Number.isFinite(m.score)) {
    return `${formatMaybePercent(m.score)}%`;
  }
  return "—";
}

type RdProcessorShape = {
  requestId?: unknown;
  mediaId?: unknown;
  overallStatus?: unknown;
  resultsSummaryStatus?: unknown;
  finalScore?: unknown;
};

function readRdProcessorFields(raw: unknown): {
  requestId: string;
  overallStatus: string;
  resultsSummaryStatus: string;
  finalScoreLabel: string;
} {
  if (!isRecord(raw)) {
    return { requestId: "", overallStatus: "", resultsSummaryStatus: "", finalScoreLabel: "" };
  }
  const o = raw as RdProcessorShape;
  const rid = o.requestId ?? o.mediaId;
  const final = o.finalScore;
  return {
    requestId: typeof rid === "string" ? rid.trim() : toDisplay(rid),
    overallStatus:
      typeof o.overallStatus === "string" ? o.overallStatus : toDisplay(o.overallStatus),
    resultsSummaryStatus:
      typeof o.resultsSummaryStatus === "string"
        ? o.resultsSummaryStatus
        : o.resultsSummaryStatus == null
          ? ""
          : toDisplay(o.resultsSummaryStatus),
    finalScoreLabel:
      typeof final === "number" && Number.isFinite(final)
        ? `${formatMaybePercent(final)}%`
        : toDisplay(final),
  };
}

/**
 * Rows for "Hive Results" (Field / Value). Empty array → skip section in PDF.
 */
export function extractHiveRows(scan: Scan): string[][] {
  const hiveProc = getProviderProcessor(scan, "hive");
  const execStatus = providerExecutionStatus(scan, "hive");

  if (!hiveProc) {
    if (execStatus === "failed") {
      const err = scan.lastError?.trim();
      if (err) {
        return [
          ["Status", "failed"],
          ["Error", err],
        ];
      }
    }
    return [];
  }

  const status: "queued" | "processing" | "completed" | "failed" =
    execStatus ?? (isRecord(hiveProc) ? "completed" : "queued");

  const view = adaptHiveProvider({
    id: "hive",
    name: "Hive",
    status,
    providerData: hiveProc,
    scan,
  });

  const rows: string[][] = [];
  rows.push(["Status", view.status]);
  if (view.verdictLabel) {
    rows.push(["Decision / Label", view.verdictLabel]);
  }
  if (view.confidencePercent != null && Number.isFinite(view.confidencePercent)) {
    rows.push(["Confidence", `${view.confidencePercent}%`]);
  }
  if (view.summary?.trim()) {
    const dup = view.verdictLabel && view.summary === `Hive verdict: ${view.verdictLabel}`;
    if (!dup) {
      rows.push(["Summary", view.summary.trim()]);
    }
  }

  const classRows: string[][] = [];
  for (const g of view.signalGroups) {
    for (const s of g.signals) {
      classRows.push([s.label, s.displayValue]);
    }
  }

  if (classRows.length > 0) {
    rows.push(...classRows);
  } else if (isRecord(hiveProc)) {
    rows.push(["Raw payload (fallback)", safeJsonSnippet(hiveProc)]);
  }

  return rows.length > 0 ? rows : [];
}

/**
 * Rows for "Reality Defender Results" (Field / Value plus model sub-rows). Empty → skip section.
 */
export function extractRealityDefenderRows(scan: Scan): string[][] {
  const rdProc = getProviderProcessor(scan, "reality_defender");
  const execStatus = providerExecutionStatus(scan, "reality_defender");

  if (!rdProc) {
    if (execStatus === "failed" && scan.lastError?.trim()) {
      return [
        ["Status", "failed"],
        ["Error", scan.lastError.trim()],
      ];
    }
    return [];
  }

  const status: "queued" | "processing" | "completed" | "failed" =
    execStatus ?? (isRecord(rdProc) ? "completed" : "queued");

  const view = adaptRealityDefenderProvider({
    id: "reality_defender",
    name: "Reality Defender",
    status,
    providerData: rdProc,
    scan,
  });

  const procFields = readRdProcessorFields(rdProc);
  const requestId =
    procFields.requestId ||
    (typeof scan.providerRequestId === "string" ? scan.providerRequestId.trim() : "") ||
    "";

  const rows: string[][] = [];
  rows.push(["Status", view.status]);
  if (view.verdictLabel) {
    rows.push(["Decision", view.verdictLabel]);
  }
  if (view.confidencePercent != null && Number.isFinite(view.confidencePercent)) {
    rows.push(["Confidence", `${view.confidencePercent}%`]);
  }
  if (procFields.overallStatus && procFields.overallStatus !== "—") {
    rows.push(["Overall status", procFields.overallStatus]);
  }
  if (procFields.resultsSummaryStatus && procFields.resultsSummaryStatus !== "—") {
    rows.push(["Results summary", procFields.resultsSummaryStatus]);
  }
  if (procFields.finalScoreLabel && procFields.finalScoreLabel !== "—") {
    rows.push(["Final score", procFields.finalScoreLabel]);
  }
  if (requestId) {
    rows.push(["Provider request ID", requestId]);
  }

  const insights = view.modelInsights?.filter((m) => m && typeof m === "object") ?? [];
  if (insights.length > 0) {
    for (const m of insights) {
      const name = typeof m.name === "string" && m.name.trim() ? m.name.trim() : "—";
      const label =
        (typeof m.decision === "string" && m.decision.trim() && m.decision) ||
        (typeof m.status === "string" && m.status.trim() && m.status) ||
        "—";
      const pct = pickModelScorePercent(m);
      rows.push([`Model · ${name}`, `${label} · ${pct}`]);
    }
  }

  return rows.length > 0 ? rows : [];
}
