import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileVideo, FileImage, FileAudio, Link2, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui-ext/StatusBadge";
import type { Scan } from "@/lib/mock-data";
import { timeAgo } from "@/lib/mock-data";

const iconFor = {
  video: FileVideo,
  image: FileImage,
  audio: FileAudio,
  url: Link2,
};

export function ScanRow({ scan, index = 0 }: { scan: Scan; index?: number }) {
  const Icon = iconFor[scan.kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link
        to="/scans/$id"
        params={{ id: scan.id }}
        className="group flex flex-col gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-border hover:bg-card/60 sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 truncate text-sm font-medium leading-snug">
                {scan.title}
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
                <StatusBadge status={scan.status} iconOnly />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" />
              </div>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="min-w-0 truncate font-mono">Scanned</span>
              {/* <span className="shrink-0">·</span> */}
              <span className="shrink-0">{timeAgo(scan.createdAt)}</span>
              {typeof scan.retryCount === "number" && scan.retryCount > 0 ? (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/30">
                  Retried
                </span>
              ) : null}
              {typeof scan.attemptNumber === "number" && scan.attemptNumber > 1 ? (
                <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning ring-1 ring-warning/30">
                  Attempt {scan.attemptNumber}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums">{scan.confidence}%</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">conf.</div>
          </div>
          <StatusBadge status={scan.status} />
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
      </Link>
    </motion.div>
  );
}
