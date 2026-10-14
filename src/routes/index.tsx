import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  ShieldCheck,
  Wallet,
  Users,
  ArrowRight,
  LineChart,
  Menu,
  X,
  Building2,
  Store,
  Utensils,
  Pill,
  Factory,
  Truck,
  Lock,
  Database,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandIdentity } from "@/components/brand-logo";
import { WorkspaceMockup } from "@/components/landing/workspace-mockup";
import { ScrollStory } from "@/components/landing/scroll-story";
import { useReveal } from "@/hooks/use-reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daraven ERP — Smarter Decisions. Better Performance." },
      {
        name: "description",
        content:
          "All-in-one inventory, financial, KPI and business performance management for retail, restaurants, wholesalers, pharmacies, manufacturers and SMEs.",
      },
      { property: "og:title", content: "Daraven ERP — Smarter Decisions. Better Performance." },
      {
        property: "og:description",
        content:
          "Run inventory, sales, finance, payroll and KPIs from one enterprise-grade platform built for multi-business teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://daraven.com/" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/" }],
  }),
  component: Landing,
});

const features = [
  {
    icon: Boxes,
    title: "Inventory intelligence",
    body: "Stock movements, batches, expiry, warehouses and reorder alerts calculated in real time.",
  },
  {
    icon: Wallet,
    title: "Financial control",
    body: "Cash flow, expenses, receivables and payables reconciled against every transaction.",
  },
  {
    icon: LineChart,
    title: "KPI engine",
    body: "Margin, turnover, growth, ROI and a composite business health score, always current.",
  },
  {
    icon: Users,
    title: "People operations",
    body: "Employees, attendance and payroll with allowances, deductions and payslip history.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    body: "Nine roles from owner to read-only auditor, enforced at the database level.",
  },
  {
    icon: BarChart3,
    title: "Reports that export",
    body: "Sales, profit, inventory and payroll reporting with CSV export built in.",
  },
];

const modules = [
  {
    label: "Inventory & operations",
    body: "Products, variants, units, categories, locations, transfers, stock counts, batches and serial numbers — with FIFO or weighted-average costing behind every movement.",
    points: ["Multi-warehouse transfers", "Batch & expiry tracking", "Reorder point alerts"],
  },
  {
    label: "Sales, POS & purchasing",
    body: "Point of sale, customer records, invoices, purchase orders and supplier management, all posting to the same ledger so stock and cash never drift apart.",
    points: ["Built-in POS", "Purchase order approvals", "Customer & supplier records"],
  },
  {
    label: "Finance & KPI analytics",
    body: "Cash flow, expenses, receivables, payables and payroll roll up into margin, turnover and growth metrics plus a composite business health score.",
    points: ["Receivables & payables ageing", "Payroll with payslip history", "Health score model"],
  },
];

const useCases = [
  { icon: Store, label: "Retail" },
  { icon: Utensils, label: "Restaurants" },
  { icon: Truck, label: "Wholesale" },
  { icon: Pill, label: "Pharmacy" },
  { icon: Factory, label: "Manufacturing" },
  { icon: Building2, label: "Services & SMEs" },
];

function Landing() {
  useReveal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Sign-in links that still return to the homepage (older emails, OAuth) carry
  // tokens in the URL — finish sign-in instead of leaving users on the landing page.
  useEffect(() => {
    const { hash, search } = window.location;
    if (/access_token=|refresh_token=/.test(hash) || /[?&]code=/.test(search)) {
      window.location.replace(`/auth/callback${search}${hash}`);
    }
  }, []);
  const heroRef = useRef<HTMLDivElement>(null);

  // Scroll-driven hero depth. rAF-throttled, writes CSS vars directly — no
  // React state churn per scroll frame.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setScrolled(y > 12);
        if (reduce) return;
        const p = Math.min(y / 620, 1);
        hero.style.setProperty("--hero-shift", `${(p * -60).toFixed(1)}px`);
        hero.style.setProperty("--hero-scale", `${(1 - p * 0.06).toFixed(3)}`);
        hero.style.setProperty("--hero-fade", `${(1 - p * 0.75).toFixed(3)}`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="brand-navy-scene min-h-screen overflow-x-clip">
      <header
        className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
          scrolled
            ? "border-white/10 bg-[oklch(0.13_0.03_264)]/85 backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandIdentity inverse />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <a
              href="#platform"
              className="rounded-lg px-3 py-2 text-sm text-white/65 transition-colors hover:text-white"
            >
              Platform
            </a>
            <a
              href="#modules"
              className="rounded-lg px-3 py-2 text-sm text-white/65 transition-colors hover:text-white"
            >
              Modules
            </a>
            <a
              href="#security"
              className="rounded-lg px-3 py-2 text-sm text-white/65 transition-colors hover:text-white"
            >
              Security
            </a>
            <Link
              to="/pricing"
              className="rounded-lg px-3 py-2 text-sm text-white/65 transition-colors hover:text-white"
            >
              Pricing
            </Link>
            <Button
              asChild
              size="sm"
              className="ml-2 bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="grid size-11 place-items-center rounded-xl border border-white/12 text-white md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-[oklch(0.13_0.03_264)]/95 backdrop-blur-xl md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4">
              {[
                ["Platform", "#platform"],
                ["Modules", "#modules"],
                ["Security", "#security"],
              ].map(([l, h]) => (
                <a
                  key={h}
                  href={h}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm text-white/75 hover:bg-white/5"
                >
                  {l}
                </a>
              ))}
              <Link
                to="/pricing"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-3 text-sm text-white/75 hover:bg-white/5"
              >
                Pricing
              </Link>
              <Button
                asChild
                className="mt-2 bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90"
              >
                <Link to="/auth" onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="brand-grid pointer-events-none absolute inset-0 -z-10" />
          <div
            ref={heroRef}
            className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20"
            style={{
              transform: "translateY(var(--hero-shift, 0px)) scale(var(--hero-scale, 1))",
              transformOrigin: "50% 0%",
            }}
          >
            <div
              className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
              style={{ opacity: "var(--hero-fade, 1)" }}
            >
              <div data-reveal className="min-w-0">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/60">
                  <span className="size-1.5 rounded-full bg-[color:var(--gold)]" />
                  Business performance platform
                </span>
                <h1 className="mt-6 font-display text-[2.5rem] font-semibold leading-[1.03] text-white sm:text-6xl">
                  Smarter Decisions.
                  <br />
                  <span className="gold-text">Better Performance.</span>
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
                  Daraven ERP brings inventory, sales, finance, payroll and KPI analytics into one
                  multi-tenant workspace — for retail, restaurants, wholesale, pharmacy,
                  manufacturing and services.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90"
                  >
                    <Link to="/auth">
                      Start 14-day Pro trial <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link to="/pricing">See pricing — from ₱0/month</Link>
                  </Button>
                </div>
                <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
                  {[
                    ["9", "Access roles"],
                    ["20+", "Modules"],
                    ["₱0", "To start"],
                  ].map(([v, l]) => (
                    <div key={l} className="min-w-0">
                      <dt className="font-display text-xl font-semibold text-white sm:text-2xl">
                        {v}
                      </dt>
                      <dd className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-white/45">
                        {l}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div
                data-reveal
                style={{ ["--reveal-delay" as string]: "140ms" }}
                className="min-w-0"
              >
                <WorkspaceMockup />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Value strip ---------------- */}
        <section className="border-y border-white/8 bg-black/25">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {[
              "Row-level tenant isolation",
              "Real-time KPI recalculation",
              "Multi-business switching",
              "CSV export on every report",
            ].map((t, i) => (
              <p
                key={t}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 70}ms` }}
                className="flex items-start gap-2 text-sm text-white/60"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--gold)]" />
                <span className="min-w-0">{t}</span>
              </p>
            ))}
          </div>
        </section>

        {/* ---------------- Sticky scroll storytelling ---------------- */}
        <ScrollStory />

        {/* ---------------- Capabilities ---------------- */}
        <section id="platform" className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <div data-reveal className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--gold)]">
              Capabilities
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
              One system of record for the whole operation.
            </h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 3) * 90}ms` }}
                className="group bg-[oklch(0.15_0.03_264)] p-7 transition-colors hover:bg-[oklch(0.18_0.035_264)]"
              >
                <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-[color:var(--gold)]">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Module reveals ---------------- */}
        <section id="modules" className="border-y border-white/8 bg-black/25">
          <div className="mx-auto max-w-6xl space-y-16 px-5 py-20 sm:px-6 sm:py-28">
            {modules.map((m, i) => (
              <div
                key={m.label}
                data-reveal
                className={`grid items-center gap-8 lg:grid-cols-2 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--gold)]">
                    0{i + 1}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-white sm:text-3xl">
                    {m.label}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-white/60 sm:text-base">
                    {m.body}
                  </p>
                  <ul className="mt-6 space-y-2">
                    {m.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-white/70">
                        <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--gold)]" />
                        <span className="min-w-0">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="glass-panel min-w-0 p-6">
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map((r) => (
                      <div key={r} className="flex items-center gap-3">
                        <span className="size-8 shrink-0 rounded-lg border border-white/10 bg-white/5" />
                        <span className="h-2 min-w-0 flex-1 rounded-full bg-white/10">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${[86, 62, 74, 48][r]}%`,
                              background:
                                r === 0
                                  ? "linear-gradient(90deg, oklch(0.6 0.12 250), oklch(0.79 0.12 85))"
                                  : "oklch(1 0 0 / 0.22)",
                            }}
                          />
                        </span>
                        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-white/45">
                          {[86, 62, 74, 48][r]}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Use cases ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <h2
            data-reveal
            className="max-w-2xl font-display text-3xl font-semibold text-white sm:text-4xl"
          >
            Built for the businesses you actually run.
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {useCases.map((u, i) => (
              <div
                key={u.label}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${i * 60}ms` }}
                className="glass-panel flex min-w-0 flex-col items-start gap-3 p-5"
              >
                <u.icon className="size-5 shrink-0 text-[color:var(--gold)]" />
                <span className="truncate text-sm text-white/75">{u.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- Security ---------------- */}
        <section id="security" className="border-y border-white/8 bg-black/25">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-6 sm:py-28 lg:grid-cols-2">
            <div data-reveal className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--gold)]">
                Security & reliability
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
                Every business you run, isolated and secure.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/60 sm:text-base">
                Create or join multiple businesses under one account and switch instantly. Row-level
                security guarantees each business only ever sees its own data, and nine roles from
                owner to read-only auditor are enforced at the database level.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: Lock,
                  t: "Role enforcement",
                  b: "Permissions checked server-side, not in the browser.",
                },
                {
                  icon: Database,
                  t: "Tenant isolation",
                  b: "Row-level security on every business-scoped table.",
                },
                {
                  icon: ShieldCheck,
                  t: "Audit trail",
                  b: "Tamper-resistant audit log of sensitive actions.",
                },
                {
                  icon: BarChart3,
                  t: "Always current",
                  b: "KPIs recalculated from live transactions.",
                },
              ].map((c, i) => (
                <div
                  key={c.t}
                  data-reveal
                  style={{ ["--reveal-delay" as string]: `${i * 80}ms` }}
                  className="glass-panel min-w-0 p-5"
                >
                  <c.icon className="size-5 text-[color:var(--gold)]" />
                  <h3 className="mt-3 font-display text-sm font-semibold text-white">{c.t}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/55">{c.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- CTA ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-6">
          <div
            data-reveal
            className="glass-panel relative overflow-hidden px-6 py-14 text-center sm:px-12"
          >
            <div aria-hidden className="gold-rule absolute inset-x-10 top-0" />
            <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
              Start with the free plan. Grow into the platform.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/60 sm:text-base">
              Set up your first business in minutes — inventory, sales and KPIs from day one.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90"
              >
                <Link to="/auth">
                  Create your account <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/pricing">Compare plans</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 px-5 py-10 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <p className="min-w-0 text-xs text-white/40">
            © {new Date().getFullYear()} Daraven ERP. Smarter Decisions. Better Performance.
          </p>
          <Link to="/pricing" className="shrink-0 text-xs text-white/60 hover:text-white">
            Pricing
          </Link>
        </div>
      </footer>
    </div>
  );
}
