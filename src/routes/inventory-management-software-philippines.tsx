import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardCheck,
  Scale,
  Warehouse,
} from "lucide-react";

import { BrandIdentity } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/inventory-management-software-philippines")({
  head: () => ({
    meta: [
      { title: "Inventory Management Software Philippines | Daraven ERP" },
      {
        name: "description",
        content:
          "Manage stock, variants, purchasing, batches, expiry dates and locations with Daraven inventory software for Philippine businesses.",
      },
      { property: "og:title", content: "Inventory Management Software Philippines | Daraven ERP" },
      {
        property: "og:description",
        content:
          "Track stock movements, costing, replenishment and multiple locations in one inventory system for Philippine businesses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:url",
        content: "https://daraven.com/inventory-management-software-philippines",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://daraven.com/inventory-management-software-philippines",
      },
    ],
  }),
  component: InventoryManagementPage,
});

const capabilities = [
  {
    icon: Boxes,
    title: "Know what is on hand",
    body: "Follow stock movements for each item and sellable variant. Keep quantities organized by location, with purchase receipts, sales, returns, transfers and counts feeding the same inventory record.",
  },
  {
    icon: Warehouse,
    title: "Manage more than one location",
    body: "Separate branch or warehouse stock, review movement history and record transfers. An inter-business transfer is not added to the receiving stock until the receiving business confirms it.",
  },
  {
    icon: CalendarDays,
    title: "Track batches and expiry dates",
    body: "Record batch, lot and expiry details where your operation needs traceability. Use expiry alerts to help staff review stock before it reaches its recorded expiry date.",
  },
  {
    icon: Scale,
    title: "Understand inventory cost",
    body: "Use FIFO or weighted-average costing for stock valuation and cost of goods sold. Item and variant costs stay attached to their inventory identity, so parent product rows can summarize rather than replace them.",
  },
  {
    icon: ClipboardCheck,
    title: "Replenish with context",
    body: "Set reorder levels and quantities, review suggested replenishment, and connect products to suppliers and purchase orders before stock runs short.",
  },
  {
    icon: BarChart3,
    title: "Connect inventory to daily work",
    body: "Use the same catalog and stock records across POS, purchasing, production, returns and reports, reducing the need to reconcile separate spreadsheets after every transaction.",
  },
];

function InventoryManagementPage() {
  return (
    <div className="brand-navy-scene min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[oklch(0.13_0.03_264)]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link to="/" aria-label="Daraven ERP home" className="flex min-w-0 items-center gap-3">
            <BrandIdentity inverse />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/pricing"
              className="rounded-lg px-3 py-2 text-sm text-white/65 transition-colors hover:text-white"
            >
              Pricing
            </Link>
            <Button asChild size="sm" className="bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90">
              <Link to="/auth">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-white/8">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              Daraven inventory management
            </p>
            <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)] lg:items-end">
              <div>
                <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  Inventory management software for Philippine businesses
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
                  Keep products, variants, purchasing and stock movement in one place. Daraven ERP
                  helps retail stores, restaurants, wholesalers and growing teams see how inventory
                  changes as they buy, sell, count and move goods.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild size="lg" className="bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90">
                    <Link to="/auth">
                      Start a workspace <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link to="/pricing">View plans</Link>
                  </Button>
                </div>
              </div>
              <p className="border-l-2 border-gold/70 pl-5 text-sm leading-relaxed text-white/60">
                Stock changes flow through business transactions and recorded movements—not a
                disconnected quantity field—so teams can review what changed and where.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              From receiving to reporting
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
              Inventory tools built around real stock workflows
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60 sm:text-base">
              Use the parts that fit your operation, from a single shop to teams managing variants,
              batches or multiple locations.
            </p>
          </div>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => (
              <article key={capability.title} className="min-w-0 border-t border-white/12 pt-5">
                <capability.icon aria-hidden="true" className="size-5 text-gold" />
                <h3 className="mt-4 font-display text-lg font-semibold text-white">
                  {capability.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{capability.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/8 bg-black/25">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
                One connected system
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold text-white">
                Inventory that follows the work
              </h2>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-white/65 sm:text-base">
              <p>
                A purchase order can lead to a receipt; a sale can reduce the appropriate item or
                variant; a return, stock count or transfer can be recorded in the movement history.
                For products made from ingredients or components, production and recipe costing
                connect the finished item to its materials.
              </p>
              <p>
                Reorder views, stock reports and cost summaries help owners and staff review the
                current position without maintaining separate copies of the catalog. Access to
                business information is controlled by workspace roles.
              </p>
              <p>
                Daraven supports Philippine businesses, but this page is product information—not
                accounting, tax or regulatory advice. Configure tax and operational settings for
                your own business before relying on generated records.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <div className="max-w-3xl">
            <h2 className="font-display text-3xl font-semibold text-white">
              Is Daraven a fit for your inventory?
            </h2>
            <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
              <article className="py-5">
                <h3 className="font-semibold text-white">Can I track different product variants?</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Yes. Active sellable variants keep their own SKU and inventory identity, while the
                  parent product can show an aggregate view.
                </p>
              </article>
              <article className="py-5">
                <h3 className="font-semibold text-white">Can I manage more than one warehouse or branch?</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Yes. Stock can be organized by location, with transfers recorded between locations
                  and receiving confirmation for transfers between businesses.
                </p>
              </article>
              <article className="py-5">
                <h3 className="font-semibold text-white">Can I use inventory with POS and purchasing?</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Inventory connects with sales, POS, purchase orders, receipts and reports, so the
                  workspace can follow those operations together.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="border-t border-white/8 bg-black/25">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:px-6 sm:py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">
                Bring your stock and daily operations together.
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Explore Daraven ERP plans or start setting up your workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-[oklch(0.16_0.04_264)] hover:bg-white/90">
                <Link to="/auth">Get started</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link to="/pricing">Compare plans</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 px-5 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link to="/" className="text-sm text-white/55 hover:text-white">
            Daraven ERP
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <Link to="/pricing" className="text-white/60 hover:text-white">
              Pricing
            </Link>
            <Link to="/terms" className="text-white/60 hover:text-white">
              Terms
            </Link>
            <Link to="/privacy" className="text-white/60 hover:text-white">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}