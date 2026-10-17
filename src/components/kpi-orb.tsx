/** Compact semantic health score indicator. */
export function KpiOrb({
  score,
  label = "Business health",
  caption,
}: {
  score: number;
  label?: string;
  caption?: string;
}) {
  const progress = Math.min(100, Math.max(0, score));
  const tone =
    score >= 70 ? "var(--success)" : score >= 45 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="grid min-h-56 place-items-center select-none">
      <div
        className="grid size-44 place-items-center rounded-full"
        style={{
          background: `conic-gradient(hsl(${tone}) ${progress * 3.6}deg, hsl(var(--border)) 0deg)`,
        }}
        role="img"
        aria-label={`${label}: ${Math.round(score)} out of 100`}
      >
        <div className="grid size-36 content-center justify-items-center rounded-full border border-card-border bg-card text-center shadow-elevate-1">
          <p className="font-display text-4xl font-semibold tabular-nums">{Math.round(score)}</p>
          <p className="mt-1 max-w-28 text-center text-sm font-medium text-muted-foreground">
            {label}
          </p>
          {caption && (
            <p className="mt-1 max-w-28 text-center text-sm text-muted-foreground">{caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}
