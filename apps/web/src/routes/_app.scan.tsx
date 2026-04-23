import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  UploadCloud,
  Link2,
  FileVideo,
  FileImage,
  FileAudio,
  CheckCircle2,
  Loader2,
  X,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getScanProviders, submitScanFile, submitScanUrl } from "@/lib/api";
import { scanKeys } from "@/features/scan/queryKeys";
import { getLiveDemoSnapshot, isLiveDemo, subscribeLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/_app/scan")({
  head: () => ({ meta: [{ title: "New scan — MediaAuth" }] }),
  component: ScanPage,
});

type Tab = "upload" | "url";
type Phase = "idle" | "uploading" | "analyzing" | "done";

function ScanPage() {
  const qc = useQueryClient();
  const liveDemo = useSyncExternalStore(subscribeLiveDemo, getLiveDemoSnapshot, () => false);
  const [tab, setTab] = useState<Tab>("upload");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const navigate = useNavigate();
  const providersQuery = useQuery({
    queryKey: ["scan-providers"],
    queryFn: getScanProviders,
    enabled: !liveDemo,
  });
  const providers = providersQuery.data ?? [];

  useEffect(() => {
    if (providers.length === 0) return;
    setSelectedProviders((prev) => {
      const allowed = new Set(providers.filter((p) => p.enabled).map((p) => p.id));
      const kept = prev.filter((id) => allowed.has(id));
      if (kept.length > 0) return kept;
      return providers.filter((p) => p.enabled).map((p) => p.id);
    });
  }, [providers]);

  useEffect(() => {
    if (liveDemo) {
      setFiles([]);
      setUrl("");
    }
  }, [liveDemo]);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(accepted);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [],
      "video/*": [],
      "audio/*": [],
    },
    multiple: true,
    disabled: liveDemo,
  });

  const startScan = async () => {
    if (isLiveDemo()) {
      toast.message("Live demo uses sample scans only. Exit demo in the banner, then run a real scan.");
      return;
    }
    setPhase("uploading");
    setProgress(25);
    try {
      let id: string;
      if (tab === "url") {
        const trimmed = url.trim();
        if (trimmed.length < 8) {
          toast.error("Enter a valid http(s) URL.");
          setPhase("idle");
          setProgress(0);
          return;
        }
        setProgress(40);
        const res = await submitScanUrl(trimmed, selectedProviders);
        id = res.id;
      } else {
        const file = files[0];
        if (!file) {
          setPhase("idle");
          setProgress(0);
          return;
        }
        if (files.length > 1) {
          toast.message("Only the first file will be submitted (API accepts one file per request).");
        }
        setProgress(25);
        const res = await submitScanFile(file, selectedProviders);
        id = res.id;
      }
      await qc.invalidateQueries({ queryKey: scanKeys.all });
      setProgress(100);
      setPhase("done");
      toast.success(tab === "url" ? "URL scan queued" : "Scan queued");
      setTimeout(() => navigate({ to: "/scans/$id", params: { id } }), 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
      setPhase("idle");
      setProgress(0);
    }
  };

  const canStart =
    !liveDemo &&
    selectedProviders.length > 0 &&
    ((tab === "upload" && files.length > 0) || (tab === "url" && url.length > 4));

  return (
    <div className="mx-auto space-y-6">
      {liveDemo ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
          <span className="font-semibold">Live demo.</span> File uploads and API scans are disabled.
          Use <span className="font-semibold">Exit demo</span> in the top banner to run real scans
          against your workspace.
        </div>
      ) : null}
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
          Authenticity engine
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Run a new scan
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload media or paste a URL — we'll analyze it for manipulation, AI generation, and
          tampering.
        </p>
      </div>

      {/* Segmented control */}
      <div className="relative grid w-fit grid-cols-2 gap-1 rounded-xl border border-border bg-card/60 p-1 backdrop-blur-xl">
        {(
          [
            { id: "upload", label: "Upload", icon: UploadCloud },
            { id: "url", label: "From URL", icon: Link2 },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="relative inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium"
          >
            {tab === t.id && (
              <motion.span
                layoutId="seg-active"
                className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-inset ring-primary/30"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <t.icon
              className={cn(
                "relative h-4 w-4",
                tab === t.id ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span
              className={cn("relative", tab === t.id ? "text-foreground" : "text-muted-foreground")}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl elevated"
      >
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              <div className="mb-5 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Providers</div>
                {providersQuery.isPending ? (
                  <div className="text-xs text-muted-foreground">Loading providers…</div>
                ) : providersQuery.isError ? (
                  <div className="text-xs text-destructive">Failed to load providers</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {providers.map((provider) => {
                      const checked = selectedProviders.includes(provider.id);
                      const disabled = !provider.enabled || liveDemo;
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setSelectedProviders((prev) =>
                              checked ? prev.filter((id) => id !== provider.id) : [...prev, provider.id]
                            );
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs transition",
                            checked
                              ? "border-primary/60 bg-primary/15 text-foreground"
                              : "border-border bg-card/50 text-muted-foreground",
                            disabled && "cursor-not-allowed opacity-50"
                          )}
                        >
                          {provider.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {tab === "upload" ? (
                <>
                  <div
                    {...getRootProps()}
                    className={cn(
                      "group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition",
                      liveDemo
                        ? "cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground"
                        : "cursor-pointer border-border/80 bg-input/30 hover:border-primary/60 hover:bg-primary/5",
                      !liveDemo && isDragActive && "border-primary bg-primary/10",
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/30 transition group-hover:scale-110">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 font-display text-lg font-semibold">
                      {liveDemo
                        ? "Uploads disabled in demo"
                        : isDragActive
                          ? "Drop files to scan"
                          : "Drag & drop media here"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {liveDemo ? (
                        "Exit live demo to add files and call the API."
                      ) : (
                        <>
                          or{" "}
                          <span className="text-primary underline-offset-4 hover:underline">
                            browse files
                          </span>{" "}
                          · images, video, audio · up to 2 GB
                        </>
                      )}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                      {[
                        { icon: FileImage, l: "JPG, PNG, WebP" },
                        { icon: FileVideo, l: "MP4, MOV" },
                        { icon: FileAudio, l: "WAV, MP3" },
                      ].map((c) => (
                        <span
                          key={c.l}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1"
                        >
                          <c.icon className="h-3 w-3" />
                          {c.l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {files.map((f, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3 rounded-lg border border-border bg-input/40 p-3"
                        >
                          <div className="grid h-9 w-9 place-items-center rounded-md bg-card text-primary ring-1 ring-border">
                            <FileVideo className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{f.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {(f.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <button
                            onClick={() => setFiles((fs) => fs.filter((_, idx) => idx !== i))}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">Media URL</span>
                    <div className="relative mt-1.5">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={liveDemo}
                        placeholder="https://example.com/video.mp4"
                        className="h-11 w-full rounded-lg border border-border bg-input/60 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    We'll fetch and analyze the media. Direct media links and most social platforms
                    are supported.
                  </p>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={!canStart}
                  onClick={startScan}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition",
                    canStart
                      ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:scale-[1.02] active:scale-[0.98]"
                      : "cursor-not-allowed bg-muted text-muted-foreground",
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Start scan
                </button>
              </div>
            </motion.div>
          )}

          {(phase === "uploading" || phase === "analyzing") && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <div className="relative grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/40">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="pulse-glow absolute inset-0 rounded-2xl" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">
                {phase === "uploading" ? "Uploading media…" : "Analyzing for manipulation…"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {phase === "uploading"
                  ? "Securely transferring your file."
                  : "Running 14 forensic models in parallel."}
              </p>

              <div className="mt-6 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  animate={{ width: phase === "uploading" ? `${progress}%` : "100%" }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {phase === "analyzing" && (
                <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-2 text-left text-xs">
                  {[
                    "Frame extraction",
                    "Face landmark analysis",
                    "Spectral check",
                    "Compression forensics",
                  ].map((s, i) => (
                    <motion.div
                      key={s}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      {s}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {phase === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-10 text-center"
            >
              <div className="grid h-20 w-20 place-items-center rounded-2xl bg-success/20 text-success ring-1 ring-success/40">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">Scan complete</h3>
              <p className="mt-1 text-sm text-muted-foreground">Opening your report…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
