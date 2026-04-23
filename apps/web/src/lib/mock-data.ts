import type { ProviderSection, ProviderTone } from "@/lib/scan-providers";

export type ScanStatus = "safe" | "flagged" | "suspicious" | "pending";
export type MediaKind = "image" | "video" | "audio" | "url";
export type NormalizedMediaType = "image" | "video" | "audio" | "document" | "other";

export type ScanModelInsight = {
  name?: string | null;
  status?: string | null;
  decision?: string | null;
  score?: number | null;
  rawScore?: number | null;
  normalizedScore?: number | null;
  finalScore?: number | null;
};

export type ScanHeatmap = {
  modelName: string;
  /** Legacy vendor presigned URL (may expire). */
  url?: string;
  /** Served from MediaAuth storage via authenticated GET `/scan/:id/heatmaps/:asset`. */
  heatmapAsset?: string;
  mimeType?: string;
};

export type Detection = {
  label: string;
  score: number;
  tone?: ProviderTone;
};

export interface Scan {
  id: string;
  title: string;
  source: "upload" | "url";  
  kind: MediaKind;
  status: ScanStatus;
  rawStatus?: string;
  confidence: number; // 0-100
  createdAt: string;
  thumbnail?: string;
  /** MIME for preview (e.g. image/jpeg); mirrors API `mime_type`. */
  mimeType?: string;
  /** Normalized backend category from MIME. */
  mediaType?: NormalizedMediaType;
  /** Public URL for demo or URL-sourced scans (`<img src>` / `<video src>`). */
  previewUrl?: string | null;
  /** Upload has stored bytes — real app loads via authenticated GET /scan/:id/media. */
  canFetchMedia?: boolean;
  /** Original file size in bytes when known (API `file_size_bytes`). */
  fileSizeBytes?: number;
  detections: Detection[];
  hiveDetections?: Detection[];
  providerSections?: ProviderSection[];
  resultPayload?: unknown;
  primaryProvider?: string;
  metadata: { key: string; value: string }[];
  timeline: { time: string; event: string }[];
  modelInsights?: ScanModelInsight[];
  modelCount?: number;
  heatmaps?: ScanHeatmap[];
  /** API strips expired vendor heatmaps and sets `heatmaps_expired` on the scan row. */
  heatmapsExpired?: boolean;

  /** Fetched via GET `/scan/:id/artifacts/aggregation` (not a URL on the scan object). */
  artifactAggregationAvailable?: boolean;
  /** Fetched via GET `/scan/:id/artifacts/model-metadata`. */
  artifactModelMetadataAvailable?: boolean;

  durationSec?: number;
  providerRequestId?: string;
  scanGroupId?: string;
  retryOfScanId?: string | null;
  attemptNumber?: number;
  retryCount?: number;
  lastError?: string | null;
  providerExecution?: Array<{
    id: string;
    name: string;
    status: "queued" | "processing" | "completed" | "failed";
  }>;
  attempts?: Array<{
    id: string;
    status: string;
    attemptNumber: number;
    createdAt?: string;
    completedAt?: string | null;
    retryOfScanId?: string | null;
  }>;
}

const now = Date.now();
const ago = (h: number) => new Date(now - h * 3600_000).toISOString();

export const scans: Scan[] = [
  {
    id: "scn_8f3a21",
    title: "press_release_clip.mp4",
    source: "upload",
    kind: "video",
    mimeType: "video/webm",
    previewUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
    status: "flagged",
    confidence: 94,
    createdAt: ago(2),
    detections: [
      { label: "Face manipulation", score: 0.94 },
      { label: "Lip-sync inconsistency", score: 0.81 },
      { label: "Frame interpolation artifacts", score: 0.62 },
    ],
    metadata: [
      { key: "Duration", value: "00:42" },
      { key: "Resolution", value: "1920×1080" },
      { key: "Codec", value: "H.264" },
      { key: "Source", value: "Direct upload" },
    ],
    timeline: [
      { time: "00:00", event: "Scan started" },
      { time: "00:03", event: "Frames extracted (1,260)" },
      { time: "00:09", event: "Face landmarks analyzed" },
      { time: "00:12", event: "Manipulation detected at 00:14–00:21" },
      { time: "00:14", event: "Report generated" },
    ],
  },
  {
    id: "scn_2c91be",
    title: "https://news.example.com/photo-43",
    source: "url",
    kind: "url",
    mimeType: "image/jpeg",
    previewUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80",
    status: "safe",
    confidence: 12,
    createdAt: ago(6),
    detections: [
      { label: "GAN signature", score: 0.08 },
      { label: "Compression anomalies", score: 0.14 },
    ],
    metadata: [
      { key: "Type", value: "image/jpeg" },
      { key: "Dimensions", value: "2400×1600" },
      { key: "EXIF", value: "Present" },
    ],
    timeline: [
      { time: "00:00", event: "URL fetched" },
      { time: "00:02", event: "Pixel forensics complete" },
      { time: "00:04", event: "Verdict: authentic" },
    ],
  },
  {
    id: "scn_4d77a0",
    title: "interview_audio.wav",
    source: "upload",
    kind: "audio",
    status: "suspicious",
    confidence: 67,
    createdAt: ago(12),
    detections: [
      { label: "Voice clone likelihood", score: 0.67 },
      { label: "Spectral discontinuity", score: 0.55 },
    ],
    metadata: [
      { key: "Duration", value: "12:08" },
      { key: "Sample rate", value: "48 kHz" },
    ],
    timeline: [
      { time: "00:00", event: "Audio uploaded" },
      { time: "00:07", event: "Spectrogram generated" },
      { time: "00:11", event: "Anomalies in 04:12–05:30" },
    ],
  },
  {
    id: "scn_9a01c7",
    title: "campaign_banner.png",
    source: "upload",
    kind: "image",
    mimeType: "image/png",
    previewUrl: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&q=80",
    status: "safe",
    confidence: 6,
    createdAt: ago(28),
    detections: [{ label: "AI-generation likelihood", score: 0.06 }],
    metadata: [
      { key: "Dimensions", value: "1600×900" },
      { key: "Color profile", value: "sRGB" },
    ],
    timeline: [
      { time: "00:00", event: "Image received" },
      { time: "00:01", event: "Verdict: authentic" },
    ],
  },
  {
    id: "scn_5e22fd",
    title: "leaked_clip.mov",
    source: "upload",
    kind: "video",
    mimeType: "video/webm",
    previewUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
    status: "pending",
    confidence: 0,
    createdAt: ago(0.2),
    detections: [],
    metadata: [{ key: "Duration", value: "01:14" }],
    timeline: [{ time: "00:00", event: "Queued for analysis" }],
  },
  {
    id: "scn_71b3ee",
    title: "ceo_statement.mp3",
    source: "upload",
    kind: "audio",
    status: "flagged",
    confidence: 89,
    createdAt: ago(48),
    detections: [
      { label: "Voice clone likelihood", score: 0.89 },
      { label: "Background noise inconsistency", score: 0.72 },
    ],
    metadata: [{ key: "Duration", value: "03:21" }],
    timeline: [
      { time: "00:00", event: "Scan started" },
      { time: "00:08", event: "Cloned voice signature detected" },
    ],
  },
];

export const metrics = [
  { label: "Total scans", value: 1284, delta: "+12.4%", trend: "up" as const },
  { label: "Flagged media", value: 47, delta: "+3", trend: "up" as const },
  { label: "Avg. confidence", value: "92%", delta: "+1.2%", trend: "up" as const },
  { label: "Avg. scan time", value: "8.4s", delta: "-0.6s", trend: "down" as const },
];

export const user = {
  name: "Alex Morgan",
  email: "alex@mediaauth.io",
  org: "Newsroom Labs",
  plan: "Pro",
  initials: "AM",
};

export function statusMeta(status: ScanStatus) {
  switch (status) {
    case "safe":
      return { label: "Authentic", color: "success" as const };
    case "flagged":
      return { label: "Manipulated", color: "destructive" as const };
    case "suspicious":
      return { label: "Suspicious", color: "warning" as const };
    case "pending":
      return { label: "Analyzing", color: "primary" as const };
  }
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
