import { useEffect, useRef } from "react";
import { ArrowUpRight, Bell, Boxes, CircleDollarSign, TrendingUp } from "lucide-react";

/**
 * Floating 3D Daraven workspace mockup.
 * Pure CSS 3D transforms; pointer tilt is written straight to style (rAF,
 * no React state) so scrolling and hovering never trigger re-renders.
 * Touch / reduced-motion visitors get the static composition.
 */
export function WorkspaceMockup() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const stage = stageRef.current;
    if (!scene || !stage) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = scene.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        stage.style.setProperty("--ry", `${(px * 12).toFixed(2)}deg`);
        stage.style.setProperty("--rx", `${(-py * 8).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      stage.style.setProperty("--ry", "0deg");
      stage.style.setProperty("--rx", "0deg");
    };

    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", onLeave);
    return () => {
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={sceneRef} className="tilt-scene relative w-full select-none">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-10 -z-10 h-64 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--gold) 22%, transparent), transparent)",
        }}
      />
      <div ref={stageRef} className="tilt-stage">
        {/* main console */}
        <div className="sheen relative overflow-hidden rounded-[20px] border border-white/10 bg-[oklch(0.15_0.03_264)]/90 shadow-[0_50px_120px_-40px_oklch(0_0_0/0.95)]">
          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <p className="ml-2 truncate text-[11px] tracking-[0.2em] text-white/45">
              DARAVEN · COMMAND CENTER
            </p>
            <Bell className="ml-auto size-3.5 shrink-0 text-white/35" />
          </div>

          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { l: "Revenue", v: "₱1.84M", d: "+12.4%", i: CircleDollarSign },
                  { l: "Gross margin", v: "38.2%", d: "+2.1%", i: TrendingUp },
                  { l: "Stock value", v: "₱642K", d: "-3.0%", i: Boxes },
                ].map((k) => (
                  <div
                    key={k.l}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 sm:p-3"
                  >
                    <div className="flex items-center gap-1.5 text-white/45">
                      <k.i className="size-3 shrink-0" />
                      <span className="truncate text-[9px] uppercase tracking-[0.14em] sm:text-[10px]">
                        {k.l}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate font-display text-sm font-semibold text-white sm:text-lg">
                      {k.v}
                    </p>
                    <p className="text-[9px] text-[color:var(--gold)] sm:text-[10px]">{k.d}</p>
                  </div>
                ))}
              </div>

              {/* revenue chart */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                    Revenue trend
                  </p>
                  <span className="text-[10px] text-white/35">12 months</span>
                </div>
                <svg viewBox="0 0 320 90" className="mt-3 h-20 w-full" aria-hidden>
                  <defs>
                    <linearGradient id="dv-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.79 0.12 85)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="oklch(0.79 0.12 85)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 74 L28 68 L56 70 L84 58 L112 60 L140 46 L168 50 L196 36 L224 30 L252 34 L280 20 L320 12 L320 90 L0 90 Z"
                    fill="url(#dv-area)"
                  />
                  <path
                    d="M0 74 L28 68 L56 70 L84 58 L112 60 L140 46 L168 50 L196 36 L224 30 L252 34 L280 20 L320 12"
                    fill="none"
                    stroke="oklch(0.79 0.12 85)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {[16, 48, 80, 112, 144, 176, 208, 240, 272, 304].map((x, i) => (
                    <rect
                      key={x}
                      x={x}
                      y={84 - ((i % 4) + 2) * 5}
                      width="6"
                      height={((i % 4) + 2) * 5}
                      rx="2"
                      fill="oklch(1 0 0 / 0.08)"
                    />
                  ))}
                </svg>
              </div>

              {/* financial table */}
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                {[
                  ["INV-2041", "Northwind Retail", "₱248,900", "Paid"],
                  ["INV-2042", "Vega Pharmacy", "₱86,400", "Open"],
                  ["INV-2043", "Sierra Foods", "₱132,050", "Overdue"],
                ].map(([id, name, amt, st]) => (
                  <div
                    key={id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 px-3 py-2 last:border-0"
                  >
                    <span className="text-[10px] text-white/40">{id}</span>
                    <span className="truncate text-[11px] text-white/80">{name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] tabular-nums text-white">{amt}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                          st === "Paid"
                            ? "bg-emerald-400/15 text-emerald-300"
                            : st === "Open"
                              ? "bg-sky-400/15 text-sky-300"
                              : "bg-rose-400/15 text-rose-300"
                        }`}
                      >
                        {st}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* operations rail */}
            <div className="min-w-0 space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                  Inventory health
                </p>
                <div className="mt-3 space-y-2.5">
                  {[
                    ["Warehouse A", 82],
                    ["Retail floor", 64],
                    ["Cold storage", 38],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div className="flex justify-between text-[10px] text-white/55">
                        <span className="truncate">{l}</span>
                        <span>{v}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${v}%`,
                            background:
                              "linear-gradient(90deg, oklch(0.6 0.12 250), oklch(0.79 0.12 85))",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Activity</p>
                <ul className="mt-2.5 space-y-2">
                  {[
                    "Low stock — 6 SKUs below reorder point",
                    "PO-1180 approved by owner",
                    "Payroll run completed · 24 employees",
                  ].map((t) => (
                    <li key={t} className="flex gap-2 text-[10px] leading-relaxed text-white/60">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
                      <span className="min-w-0">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* floating layered cards */}
        <div
          className="absolute -left-3 bottom-10 hidden w-40 rounded-2xl border border-white/12 bg-[oklch(0.19_0.04_264)]/95 p-3 shadow-[0_30px_60px_-30px_oklch(0_0_0/0.9)] sm:block"
          style={{ transform: "translateZ(70px)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Health score</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">86</p>
          <p className="flex items-center gap-1 text-[10px] text-emerald-300">
            <ArrowUpRight className="size-3" /> Strong performance
          </p>
        </div>
        <div
          className="absolute -right-3 top-16 hidden w-40 rounded-2xl border border-white/12 bg-[oklch(0.19_0.04_264)]/95 p-3 shadow-[0_30px_60px_-30px_oklch(0_0_0/0.9)] lg:block"
          style={{ transform: "translateZ(90px)" }}
        >
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Today&apos;s sales</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">₱48,210</p>
          <div className="mt-2 flex h-8 items-end gap-1">
            {[5, 9, 6, 12, 8, 14, 11].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-sm bg-[color:var(--gold)]/70"
                style={{ height: `${h * 6}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
