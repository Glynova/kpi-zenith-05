import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";

export type StatTone = "default" | "success" | "warning" | "destructive" | "gold";

const TONE: Record<StatTone, { text: string }> = {
  default: { text: "text-foreground" },
  success: { text: "text-success" },
  warning: { text: "text-warning" },
  destructive: { text: "text-destructive" },
  gold: { text: "text-gold" },
};

/**
 * Premium KPI tile: label, value, optional delta vs. the comparison period and
 * an optional sparkline. All numbers are supplied by the caller.
 */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  delta,
  deltaLabel,
  series,
  invertDelta = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Percent change vs. the previous period. Null/undefined hides the pill. */
  delta?: number | null;
  deltaLabel?: string;
  series?: number[];
  /** When true, a decrease is treated as good (e.g. expenses). */
  invertDelta?: boolean;
  className?: string;
}) {
  const t = TONE[tone];
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const up = hasDelta && (delta as number) > 0.05;
  const down = hasDelta && (delta as number) < -0.05;
  const good = invertDelta ? down : up;
  const bad = invertDelta ? up : down;
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;

  return (
    <div className={cn("surface-card relative isolate min-h-32 overflow-hidden p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("size-4 shrink-0", t.text)} />}
      </div>

      <p
        className={cn(
          "mt-3 truncate font-display font-semibold tabular-nums",
          value.length > 12 ? "text-2xl" : "text-4xl",
        )}
      >
        {value}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {hasDelta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium tabular-nums",
                good
                  ? "border-success/30 bg-success/10 text-success"
                  : bad
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              <DeltaIcon className="size-3" />
              {Math.abs(delta as number).toFixed(1)}%
            </span>
          )}
          {(sub || deltaLabel) && (
            <p className="mt-1 truncate text-sm text-muted-foreground">{sub ?? deltaLabel}</p>
          )}
        </div>
        {series && series.length > 1 && (
          <Sparkline
            data={series}
            className="h-8 w-20 shrink-0 opacity-90"
            stroke={
              tone === "success"
                ? "hsl(var(--success))"
                : tone === "warning"
                  ? "hsl(var(--warning))"
                  : tone === "destructive"
                    ? "hsl(var(--destructive))"
                    : tone === "gold"
                      ? "hsl(var(--gold))"
                      : "hsl(var(--primary))"
            }
          />
        )}
      </div>
    </div>
  );
}
