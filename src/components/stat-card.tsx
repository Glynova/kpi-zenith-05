import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";

export type StatTone = "default" | "success" | "warning" | "destructive" | "gold";

const TONE: Record<StatTone, { text: string; glow: string }> = {
  default: { text: "text-primary", glow: "from-primary/12" },
  success: { text: "text-success", glow: "from-success/12" },
  warning: { text: "text-warning", glow: "from-warning/12" },
  destructive: { text: "text-destructive", glow: "from-destructive/12" },
  gold: { text: "text-gold", glow: "from-gold/12" },
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
    <div
      className={cn(
        "surface-card relative isolate overflow-hidden p-4 sm:p-5",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-14 -z-10 size-32 rounded-full bg-gradient-to-b to-transparent blur-2xl",
          t.glow,
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {Icon && <Icon className={cn("size-4 shrink-0", t.text)} />}
      </div>

      <p className="mt-3 truncate font-display text-xl font-semibold tabular-nums sm:text-2xl">
        {value}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {hasDelta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
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
            <p className="mt-1 truncate text-xs text-muted-foreground">{sub ?? deltaLabel}</p>
          )}
        </div>
        {series && series.length > 1 && (
          <Sparkline
            data={series}
            className="h-8 w-20 shrink-0 opacity-90"
            stroke={
              tone === "success"
                ? "var(--success)"
                : tone === "warning"
                  ? "var(--warning)"
                  : tone === "destructive"
                    ? "var(--destructive)"
                    : tone === "gold"
                      ? "var(--gold)"
                      : "var(--primary)"
            }
          />
        )}
      </div>
    </div>
  );
}
