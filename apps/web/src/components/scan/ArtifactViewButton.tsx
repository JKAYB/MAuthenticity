import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export type ScanArtifactType = "aggregation" | "model-metadata";

type Props = {
  scanId: string;
  artifactType: ScanArtifactType;
  label: string;
};

/**
 * Fetches artifact JSON with JWT (same pattern as heatmaps) and opens it in a new tab via blob URL.
 * Does not use vendor URLs or raw storage keys — only `artifactType` + `scanId`.
 */
export function ArtifactViewButton({ scanId, artifactType, label }: Props) {
  const [busy, setBusy] = useState(false);

  const openArtifact = async () => {
    setBusy(true);
    try {
      const path = `/scan/${encodeURIComponent(scanId)}/artifacts/${encodeURIComponent(artifactType)}`;
      const res = await apiFetch(path);
      if (!res.ok) {
        const msg = res.status === 404 ? "Artifact not available." : `Could not load artifact (${res.status})`;
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) {
        toast.error("Pop-up blocked — allow pop-ups for this site to view the artifact.");
        URL.revokeObjectURL(url);
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load artifact");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void openArtifact()}
      className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <FileText className="h-4 w-4 shrink-0" aria-hidden />}
      {label}
    </button>
  );
}
