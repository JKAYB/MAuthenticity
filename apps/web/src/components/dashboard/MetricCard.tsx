import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  trend,
  index = 0,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  delta: string;
  trend: "up" | "down";
  index?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const positive = trend === "up";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="group relative min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur-xl elevated md:p-5"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 opacity-50 blur-2xl transition-opacity group-hover:opacity-80 md:-right-12 md:-top-12 md:h-32 md:w-32" />
      <div className="relative flex items-start justify-between gap-1.5 md:items-center">
        <span className="min-w-0 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground md:text-xs md:tracking-wider">
          {label}
        </span>
        {Icon && (
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted/60 text-primary ring-1 ring-border md:h-8 md:w-8 md:rounded-lg">
            <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </div>
        )}
      </div>
      <div className="relative mt-1.5 flex items-end justify-between gap-1 md:mt-3">
        <div className="min-w-0 truncate font-display text-xl font-semibold tabular-nums tracking-tight md:text-3xl">
          {value}
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-[10px] font-medium md:px-1.5 md:py-0.5 md:text-xs",
            positive
              ? "bg-success/12 text-success"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {positive ? (
            <ArrowUpRight className="h-2.5 w-2.5 md:h-3 md:w-3" />
          ) : (
            <ArrowDownRight className="h-2.5 w-2.5 md:h-3 md:w-3" />
          )}
          {delta}
        </div>
      </div>
    </motion.div>
  );
}
