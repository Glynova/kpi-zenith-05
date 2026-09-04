/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Info, Loader2, Sparkles, TicketPercent } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useBusiness } from "@/lib/business-context";
import { useSubscription } from "@/lib/use-subscription";
import { formatPHP, PLAN_HIGHLIGHTS } from "@/lib/billing";
import { startSubscription } from "@/lib/billing.functions";
import { previewPromoCode } from "@/lib/affiliate.functions";

export const Route = createFileRoute("/_authenticated/_shell/upgrade")({
  head: () => ({
    meta: [
      { title: "Upgrade Plan — Daraven ERP" },
      {
        name: "description",
        content:
          "Compare Daraven plans, apply a promo code and start a Pro or Business subscription.",
      },
      { property: "og:title", content: "Upgrade Plan — Daraven ERP" },
      {
        property: "og:description",
        content: "Choose a plan, preview your promo code and check out securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UpgradePage,
});

const ORDER = ["free", "pro", "business"];

function UpgradePage() {
  const { businessId, isAdmin } = useBusiness();
  const sub = useSubscription();
  const preview = useServerFn(previewPromoCode);
  const start = useServerFn(startSubscription);

  const [selected, setSelected] = useState<string>("pro");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [promo, setPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const plans = sub.plans
    .slice()
    .sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug))
    .filter((p) => Number(p.price) > 0);
  const plan = plans.find((p) => p.slug === selected) ?? plans[0];

  async function checkPromo() {
    if (!businessId || !code.trim() || !plan) return;
    setChecking(true);
    setPromoError(null);
    try {
      const res: any = await preview({
        data: { businessId, planSlug: plan.slug as any, code: code.trim() },
      });
      if (!res.ok) {
        setPromo(null);
        setPromoError(res.message ?? "This code cannot be used.");
      } else {
        setPromo(res);
      }
    } catch (err) {
      setPromo(null);
      setPromoError(err instanceof Error ? err.message : "Could not check the code");
    } finally {
      setChecking(false);
    }
  }

  async function checkout() {
    if (!businessId || !plan) return;
    if (!isAdmin) return toast.error("Only owners and admins can change the plan");
    setPending(true);
    try {
      const res: any = await start({
        data: {
          businessId,
          planSlug: plan.slug as any,
          ...(promo?.ok ? { promoCode: promo.code } : {}),
        },
      });
      if (res?.configured === false) {
        toast.error(res.reason ?? "Online payments are not configured yet.");
      } else if (res?.ok === false) {
        toast.error(res.reason ?? "Could not start the subscription.");
      } else if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      } else {
        toast.success(`Plan updated to ${plan.name}`);
        sub.refetch();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setPending(false);
    }
  }

  if (sub.loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Upgrade plan" description="Loading plans..." />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upgrade plan"
        description="Pick a plan, preview a promo code, then continue to secure checkout."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/billing">Billing & invoices</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === sub.plan?.id;
          const active = p.slug === plan?.slug;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelected(p.slug);
                setPromo(null);
                setPromoError(null);
              }}
              className={cn(
                "relative flex flex-col rounded-xl border border-border p-5 text-left transition",
                active ? "border-primary shadow-elevate-2" : "hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                {isCurrent ? (
                  <Badge variant="secondary">Current</Badge>
                ) : (
                  p.slug === "pro" && (
                    <Badge className="gap-1">
                      <Sparkles className="size-3" /> Popular
                    </Badge>
                  )
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {formatPHP(Number(p.price))}
                <span className="text-sm font-normal text-muted-foreground"> /month</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {(PLAN_HIGHLIGHTS[p.slug] ?? []).map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TicketPercent className="size-4" /> Promo code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="max-w-xs"
            />
            <Button variant="outline" onClick={checkPromo} disabled={checking || !code.trim()}>
              {checking && <Loader2 className="size-4 animate-spin" />} Preview discount
            </Button>
          </div>
          {promoError && <p className="text-sm text-destructive">{promoError}</p>}
          {promo?.ok && (
            <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{promo.code}</Badge>
                <span className="text-muted-foreground">{promo.description ?? "Discount"}</span>
                <Badge variant="secondary">{promo.duration}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Detail label="Plan price" value={formatPHP(promo.originalAmount)} />
                <Detail label="Discount" value={`− ${formatPHP(promo.discountAmount)}`} />
                <Detail label="Net after credit" value={formatPHP(promo.finalAmount)} />
              </div>
              {!promo.providerApplied && (
                <p className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong className="text-foreground">
                      Checkout will charge the full {formatPHP(promo.originalAmount)}.
                    </strong>{" "}
                    {promo.settlement}
                  </span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-elevate-2">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm text-muted-foreground">You&apos;re subscribing to</p>
            <p className="font-display text-lg font-semibold">
              {plan?.name} — {formatPHP(Number(plan?.price ?? 0))} / month
            </p>
            <p className="text-xs text-muted-foreground">
              Amount charged by the payment provider today:{" "}
              {formatPHP(Number(plan?.price ?? 0))}
              {promo?.ok && !promo.providerApplied ? " (promo settled as a credit)" : ""}
            </p>
          </div>
          <Button size="lg" onClick={checkout} disabled={pending || !isAdmin || !plan}>
            {pending && <Loader2 className="size-4 animate-spin" />} Continue to checkout
          </Button>
        </CardContent>
      </Card>
      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Only owners and admins can change the workspace plan.
        </p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
