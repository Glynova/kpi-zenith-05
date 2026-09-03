/**
 * Signature 3D moment for the dashboard.
 * Pure CSS 3D (transform-only, GPU composited) — no WebGL, no extra bundle weight.
 */
export function KpiOrb({
  score,
  label = "Business health",
  caption,
}: {
  score: number;
  label?: string;
  caption?: string;
}) {
  const rings = [0, 30, 60, 90, 120, 150];
  const tone =
    score >= 70 ? "var(--chart-2)" : score >= 45 ? "var(--chart-3)" : "var(--chart-5)";

  return (
    <div className="scene-3d relative grid h-56 place-items-center select-none">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute size-48 rounded-full blur-3xl opacity-40"
        style={{ background: `radial-gradient(circle, ${tone}, transparent 65%)` }}
      />
      <div className="orb-float">
        <div className="orb-3d relative size-40">
          {rings.map((deg, i) => (
            <div
              key={deg}
              aria-hidden
              className="orb-ring absolute inset-0 rounded-full border"
              style={{
                transform: `rotateY(${deg}deg)`,
                borderColor: i % 2 === 0 ? tone : "var(--primary)",
                animationDelay: `${i * 240}ms`,
              }}
            />
          ))}
          <div
            aria-hidden
            className="absolute inset-6 rounded-full opacity-70 blur-md"
            style={{
              background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${tone} 65%, transparent), transparent 70%)`,
            }}
          />
        </div>
      </div>
      <div className="pointer-events-none absolute text-center">
        <p className="font-display text-3xl font-semibold tabular-nums">{Math.round(score)}</p>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        {caption && <p className="mt-1 text-[11px] text-muted-foreground">{caption}</p>}
      </div>
    </div>
  );
}
