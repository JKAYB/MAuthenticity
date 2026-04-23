import type { Detection, MediaKind, Scan, ScanHeatmap, ScanStatus } from "@/lib/mock-data";
import type { ApiScanRow } from "@/lib/api";
import { formatProviderOutputs } from "@/lib/scan-providers";

function mapApiStatus(row: ApiScanRow): ScanStatus {
  const s = row.status?.toLowerCase() || "";
  if (s === "failed") return "suspicious";
  if (s === "pending" || s === "processing") return "pending";
  if (s === "completed") {
    if (row.is_ai_generated === true) return "flagged";
    if (row.is_ai_generated === false) return "safe";
    return "suspicious";
  }
  return "pending";
}

function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "image";
}

function scanKind(row: ApiScanRow): MediaKind {
  if (row.source_type === "url") return "url";
  return kindFromMime(row.mime_type || "");
}

function numConfidence(c: ApiScanRow["confidence"]): number {
  if (c == null) return 0;
  const n = typeof c === "string" ? Number.parseFloat(c) : c;
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function formatBytesToKb(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(Number(bytes))) return "—";
  return `${(Number(bytes) / 1024).toFixed(1)} KB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
  const total = Math.max(0, Math.round(Number(seconds)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

type ResultPayload = {
  primaryProvider?: string;
  processors?: Record<string, unknown>;
  [k: string]: unknown;
};

export function apiScanToUiScan(row: ApiScanRow): Scan {
  const status = mapApiStatus(row);
  const confidence = numConfidence(row.confidence);
  const payload = row.result_payload as ResultPayload | null;
  const rowExt = row as ApiScanRow & {
    heatmaps_expired?: boolean;
    artifact_aggregation_available?: boolean;
    artifact_model_metadata_available?: boolean;
  };
  const heatmapsExpiredFlag = rowExt.heatmaps_expired === true;
  const artifactAggregationAvailable = rowExt.artifact_aggregation_available === true;
  const artifactModelMetadataAvailable = rowExt.artifact_model_metadata_available === true;
  const kind = scanKind(row);
  const providerOutputs = formatProviderOutputs(payload, kind);
  const details = providerOutputs.reality.details;
  const detections = providerOutputs.reality.detections;
  const hiveDetections = providerOutputs.hive.signals.map((s) => ({
    label: s.label,
    score: s.score,
    tone: s.tone
  }));
  const applicableModels = providerOutputs.reality.modelInsights;
  const heatmaps: ScanHeatmap[] = providerOutputs.reality.heatmaps;
  const providerSections = [providerOutputs.reality.section, providerOutputs.hive.section].filter(
    (section): section is NonNullable<typeof section> => section != null
  );

  const metadata: { key: string; value: string }[] = [
    { key: "MIME type", value: row.mime_type || "—" },
    { key: "Source", value: row.source_type === "url" ? "URL" : "Upload" },
    ...(row.detection_provider ? [{ key: "Detection provider", value: row.detection_provider }] : []),
    ...(details?.detectionVendor ? [{ key: "Detection vendor", value: details.detectionVendor }] : []),
    ...(details?.requestId ? [{ key: "Provider request ID", value: details.requestId }] : []),
    ...(row.source_url ? [{ key: "URL", value: row.source_url }] : []),
    { key: "Status", value: row.status },
    {
      key: "Size",
      value: formatBytesToKb(
        row.file_size_bytes != null ? Number(row.file_size_bytes) : details?.fileSize
      ),
    },
    ...(details?.durationSec != null ? [{ key: "Duration", value: formatDuration(details.durationSec) }] : []),
    ...(details?.resultsSummaryStatus ? [{ key: "Result", value: details.resultsSummaryStatus }] : []),
    ...(typeof details?.finalScore === "number" ? [{ key: "Final score", value: `${details.finalScore}%` }] : []),
    ...(typeof details?.modelCount === "number" ? [{ key: "Signals", value: String(details.modelCount) }] : []),
    ...(artifactAggregationAvailable ? [{ key: "Aggregation JSON", value: "Available" }] : []),
    ...(artifactModelMetadataAvailable ? [{ key: "Model metadata", value: "Available" }] : []),
    ...(heatmaps.length > 0 ? [{ key: "Heatmaps", value: String(heatmaps.length) }] : []),
  ];

  if (row.error_message) metadata.push({ key: "Error", value: row.error_message });
  if (row.summary) metadata.push({ key: "Summary", value: row.summary });

  const timeline = [
    { time: "—", event: `Scan record · ${row.status}` },
    ...(details?.requestId ? [{ time: "—", event: `Reality Defender request · ${details.requestId}` }] : []),
    ...(row.completed_at ? [{ time: "—", event: `Completed ${row.completed_at}` }] : []),
  ];

  const previewUrl =
    String(row.source_type || "").toLowerCase() === "url" &&
    row.source_url &&
    /^https?:\/\//i.test(String(row.source_url).trim())
      ? String(row.source_url).trim()
      : null;

  const canFetchMedia =
    String(row.source_type || "upload").toLowerCase() === "upload" &&
    Boolean(row.storage_key && String(row.storage_key).trim());

  return {
    id: row.id,
    title: row.filename || "Untitled",
    source: row.source_type === "url" ? "url" : "upload",
    kind,
    status,
    rawStatus: row.status,
    confidence,
    createdAt: row.created_at,
    mimeType: row.mime_type || undefined,
    mediaType: row.media_type || undefined,
    previewUrl,
    canFetchMedia,
    fileSizeBytes:
      row.file_size_bytes != null && Number.isFinite(Number(row.file_size_bytes))
        ? Math.trunc(Number(row.file_size_bytes))
        : details?.fileSize != null && Number.isFinite(Number(details.fileSize))
          ? Math.trunc(Number(details.fileSize))
          : undefined,
    detections,
    hiveDetections,
    providerSections,
    resultPayload: payload || undefined,
    primaryProvider:
      payload && typeof payload.primaryProvider === "string" ? payload.primaryProvider : undefined,
    metadata,
    timeline,
    modelInsights: applicableModels,
    modelCount: typeof details?.modelCount === "number" ? details.modelCount : applicableModels.length,
    heatmaps,
    heatmapsExpired: heatmapsExpiredFlag || undefined,
    artifactAggregationAvailable: artifactAggregationAvailable || undefined,
    artifactModelMetadataAvailable: artifactModelMetadataAvailable || undefined,
    durationSec:
      providerOutputs.reality.durationSec != null ? providerOutputs.reality.durationSec : undefined,
    providerRequestId: providerOutputs.reality.providerRequestId || undefined,
    scanGroupId: row.scan_group_id || row.id,
    retryOfScanId: row.retry_of_scan_id || null,
    attemptNumber: typeof row.attempt_number === "number" ? row.attempt_number : 1,
    retryCount: typeof row.retry_count === "number" ? row.retry_count : 0,
    lastError: row.last_error || row.error_message || null,
    providerExecution: Array.isArray(row.provider_execution)
      ? row.provider_execution.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
        }))
      : undefined,
    attempts: Array.isArray(row.attempts)
      ? row.attempts.map((a) => ({
          id: a.id,
          status: a.status,
          attemptNumber: typeof a.attempt_number === "number" ? a.attempt_number : 1,
          createdAt: a.created_at,
          completedAt: a.completed_at ?? null,
          retryOfScanId: a.retry_of_scan_id ?? null
        }))
      : undefined,
  };
}