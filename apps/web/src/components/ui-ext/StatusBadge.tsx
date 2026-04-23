import { cn } from "@/lib/utils";
import type { ScanStatus } from "@/lib/mock-data";
import { statusMeta } from "@/lib/mock-data";
import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2, XCircle } from "lucide-react";

const styles: Record<ScanStatus, string> = {
  safe: "bg-success/12 text-success ring-success/30",
  flagged: "bg-destructive/15 text-destructive ring-destructive/30",
  suspicious: "bg-warning/12 text-warning ring-warning/30",
  pending: "bg-primary/15 text-primary ring-primary/30",
  failed: "bg-destructive/12 text-destructive ring-destructive/35",
};

const icons: Record<ScanStatus, React.ComponentType<{ className?: string }>> = {
  safe: CheckCircle2,
  flagged: ShieldAlert,
  suspicious: AlertTriangle,
  pending: Loader2,
  failed: XCircle,
};

export function StatusBadge({
  status,
  className,
  iconOnly = false,
}: {
  status: ScanStatus;
  className?: string;
  /** Icon + colors only; label is screen-reader only (e.g. scan list on small screens). */
  iconOnly?: boolean;
}) {
  const meta = statusMeta(status);
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full text-xs font-medium ring-1 ring-inset",
        iconOnly ? "gap-0 p-1.5" : "gap-1.5 px-2.5 py-1",
        styles[status],
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "pending" && "animate-spin")} />
      {iconOnly ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}
