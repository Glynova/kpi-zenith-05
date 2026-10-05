import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPHP, PLAN_HIGHLIGHTS } from "@/lib/billing";
import { usePlanCatalog } from "@/lib/use-subscription";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Daraven ERP plans in PHP" },
      {
        name: "description",
        content:
          "Simple monthly pricing for Daraven ERP: Free, Pro at ₱999/month and Business at ₱1,999/month. Start with a 14-day Pro trial.",
      },
      { property: "og:title", content: "Pricing — Daraven ERP plans in PHP" },
      {
        property: "og:description",
        content:
          "Three straightforward plans. No per-user pricing, no transaction fees. Start free with a 14-day Pro trial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://daraven.com/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/pricing" }],
  }),
  component: Pricing,
});

const ORDER = ["free", "pro", "business"];

function Pricing() {
  const { data, isLoading, isError, refetch } = usePlanCatalog();
  const plans = (data?.plans ?? [])
    .slice()
    .sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <header className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4">
            Simple, transparent pricing
          </Badge>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">
            One price per month. Every module included.
          </h1>
          <p className="mt-4 text-muted-foreground">
            No per-user pricing, no transaction fees, no calculators. Pick a plan, run your
            business. Every new workspace starts with a 14-day Pro trial.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild size="lg">
              <Link to="/auth">
                Start 14-day Pro trial <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/">Back to overview</Link>
            </Button>
          </div>
        </header>

        {isError && (
          <div className="mx-auto mt-12 max-w-md space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">We couldn&apos;t load the plans.</p>
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-[480px] w-full rounded-xl" />)}

          {plans.map((plan) => {
            const recommended = plan.slug === "pro";
            return (
              <section
                key={plan.id}
                className={cn(
                  "surface-card relative flex flex-col rounded-xl border border-border p-6",
                  recommended && "border-primary/60 shadow-elevate-3 lg:-mt-4 lg:mb-4",
                )}
              >
                {recommended && (
                  <Badge className="absolute -top-3 left-6 gap-1">
                    <Sparkles className="size-3" /> Recommended
                  </Badge>
                )}
                <h2 className="font-display text-xl font-semibold">{plan.name}</h2>
                <p className="mt-1.5 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-semibold tracking-tight">
                    {formatPHP(Number(plan.price))}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                {plan.trial_days > 0 && (
                  <p className="mt-1 text-xs text-primary">
                    Includes a {plan.trial_days}-day free trial for new workspaces
                  </p>
                )}
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {(PLAN_HIGHLIGHTS[plan.slug] ?? []).map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className="mt-6 w-full"
                  variant={recommended ? "default" : "outline"}
                >
                  <Link to="/auth">
                    {plan.slug === "free" ? "Start free" : `Choose ${plan.name}`}
                  </Link>
                </Button>
              </section>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Prices in Philippine peso, billed monthly. Card and Maya payments are processed by
          PayMongo. Cancel anytime — your business data is always retained and exportable.
        </p>
      </div>
    </main>
  );
}
