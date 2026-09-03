import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  ShieldCheck,
  Wallet,
  Users,
  ArrowRight,
  LineChart,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

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
    ],
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

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLogo markClassName="size-10" />
        <nav className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost">
            <Link to="/pricing">Pricing</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </nav>

      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 sm:pt-24">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
            Business performance platform
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-6xl">
            Smarter Decisions.
            <br />
            Better Performance.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Daraven ERP brings inventory, sales, finance, payroll and KPI analytics into one
            multi-tenant workspace — for retail, restaurants, wholesale, pharmacy, manufacturing
            and services.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Start 14-day Pro trial <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">See pricing — from ₱0/month</Link>
            </Button>
          </div>

        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-px bg-border px-0 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-background p-8">
                <f.icon className="size-5 text-primary" />
                <h2 className="mt-4 font-display text-base font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="max-w-2xl text-2xl font-semibold sm:text-3xl">
            Every business you run, isolated and secure.
          </h2>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Create or join multiple businesses under one account and switch instantly. Row-level
            security guarantees each business only ever sees its own data.
          </p>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8">
        <p className="mx-auto max-w-6xl text-xs text-muted-foreground">
          © {new Date().getFullYear()} Daraven ERP. Smarter Decisions. Better Performance.
        </p>
      </footer>
    </div>
  );
}
