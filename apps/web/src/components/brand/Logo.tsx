import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex touch-manipulation select-none items-center gap-2 [-webkit-tap-highlight-color:transparent]",
        className,
      )}
    >
      <div className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]">
        <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
        <span className="absolute inset-0 rounded-lg ring-1 ring-white/20" />
      </div>
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight">
          Media<span className="gradient-text">Auth</span>
        </span>
      )}
    </div>
  );
}
