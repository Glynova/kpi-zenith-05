import { useEffect, useRef, useState } from "react";
import { Boxes, LineChart, ShieldCheck, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { WorkspaceMockup } from "@/components/landing/workspace-mockup";

const CHAPTERS = [
  {
    icon: Boxes,
    kicker: "01 — Operations",
    title: "Every movement lands in one ledger",
    body: "Receiving, transfers, counts, batches and serials post straight into costed stock, so what the warehouse sees is what finance reports.",
  },
  {
    icon: Wallet,
    kicker: "02 — Finance",
    title: "Cash, receivables and payables in step",
    body: "Sales and purchases settle against the same accounts, keeping ageing, cash position and expense mix continuously reconciled.",
  },
  {
    icon: LineChart,
    kicker: "03 — Performance",
    title: "KPIs recalculated as the day happens",
    body: "Margin, turnover, growth and the composite health score update from live transactions — no exports, no spreadsheet lag.",
  },
  {
    icon: ShieldCheck,
    kicker: "04 — Governance",
    title: "Access enforced at the database",
    body: "Nine roles, tenant isolation and an immutable audit trail mean each business only ever sees its own numbers.",
  },
];

/**
 * Sticky scroll-storytelling section: the workspace mockup stays anchored on
 * desktop while chapter panels advance. Pure IntersectionObserver + CSS —
 * on mobile it degrades to a simple stacked list.
 */
export function ScrollStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const nodes = refs.current.filter(Boolean) as HTMLElement[];
    if (!nodes.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setActive(i);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <section aria-label="How Daraven works" className="border-b border-white/8 bg-black/20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
        <div data-reveal className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold">The workflow</p>
          <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
            One workspace, from the stockroom to the board pack
          </h2>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Anchored visual — sticky on desktop only */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <div className="relative min-w-0">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklab,hsl(var(--primary))_22%,transparent),transparent_70%)] blur-2xl"
                />
                <WorkspaceMockup />
                <div className="mt-6 flex items-center gap-2" role="presentation">
                  {CHAPTERS.map((c, i) => (
                    <span
                      key={c.kicker}
                      className={cn(
                        "h-[3px] flex-1 rounded-full transition-colors duration-500",
                        i === active ? "bg-gold" : "bg-white/12",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Chapters */}
          <ol className="space-y-6 lg:space-y-24">
            {CHAPTERS.map((c, i) => (
              <li key={c.kicker}>
                <div
                  data-index={i}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  className={cn(
                    "rounded-2xl border p-6 transition-all duration-500 motion-reduce:transition-none sm:p-7",
                    i === active
                      ? "border-gold/35 bg-white/[0.06] shadow-[0_24px_60px_-40px_rgba(0,0,0,0.9)] lg:translate-x-0 lg:opacity-100"
                      : "border-white/8 bg-white/[0.02] lg:opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
                        i === active ? "bg-gold/15 text-gold" : "bg-white/6 text-white/50",
                      )}
                    >
                      <c.icon className="size-4" />
                    </span>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                      {c.kicker}
                    </p>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-white sm:text-2xl">
                    {c.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
