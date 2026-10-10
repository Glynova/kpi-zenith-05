/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Loader2,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useBusiness } from "@/lib/business-context";
import { useSubscription } from "@/lib/use-subscription";
import {
  formatDate,
  formatMoney,
  formatPHP,
  PLAN_HIGHLIGHTS,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/lib/billing";
import {
  cancelSubscription,
  getBillingDiagnostics,
  getBillingHistory,
  resumeSubscription,
  startSubscription,
  syncPaymongoPlans,
} from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/_shell/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Subscription — Daraven ERP" },
      {
        name: "description",
        content: "Manage your Daraven plan, trial, invoices and payment status.",
      },
      { property: "og:title", content: "Billing & Subscription — Daraven ERP" },
      {
        property: "og:description",
        content: "Current plan, trial countdown, billing history and plan comparison.",
      },
    ],
  }),
  component: BillingPage,
});

const ORDER = ["free", "pro", "business"];

function BillingPage() {
  const { businessId, isAdmin } = useBusiness();
  const queryClient = useQueryClient();
  const sub = useSubscription();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const history = useServerFn(getBillingHistory);
  const diagnostics = useServerFn(getBillingDiagnostics);
  const start = useServerFn(startSubscription);
  const cancel = useServerFn(cancelSubscription);
  const resume = useServerFn(resumeSubscription);
  const syncPlans = useServerFn(syncPaymongoPlans);

  const historyQuery = useQuery({
    queryKey: ["billing-history", businessId],
    enabled: !!businessId,
    queryFn: () => history({ data: { businessId: businessId! } }),
  });

  const diagQuery = useQuery({
    queryKey: ["billing-diagnostics", businessId],
    enabled: !!businessId && isAdmin,
    queryFn: () => diagnostics({ data: { businessId: businessId! } }),
  });

  const plans = sub.plans.slice().sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
  const currentPlan = sub.plan;
  const record = sub.subscription;

  function refreshAll() {
    sub.refetch();
    void queryClient.invalidateQueries({ queryKey: ["billing-history", businessId] });
    void queryClient.invalidateQueries({ queryKey: ["billing-diagnostics", businessId] });
  }

  async function choosePlan(slug: string) {
    if (!businessId) return;
    if (!isAdmin) return toast.error("Only owners and admins can change the plan");
    setPending(slug);
    try {
      const res: any = await start({ data: { businessId, planSlug: slug as any } });
      if (res?.configured === false) {
        toast.error(res.reason ?? "Online payments are not configured yet.");
      } else if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      } else {
        toast.success(`Plan updated to ${slug}`);
      }
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change plan");
    } finally {
      setPending(null);
    }
  }

  async function doCancel() {
    if (!businessId) return;
    setPending("cancel");
    try {
      await cancel({ data: { businessId } });
      toast.success("Subscription cancelled. Your data stays available.");
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setPending(null);
      setConfirmCancel(false);
    }
  }

  async function doResume() {
    if (!businessId) return;
    setPending("resume");
    try {
      await resume({ data: { businessId } });
      toast.success("Subscription resumed");
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resume");
    } finally {
      setPending(null);
    }
  }

  async function doSyncPlans() {
    if (!businessId) return;
    setPending("sync");
    try {
      const res: any = await syncPlans({ data: { businessId } });
      if (!res.configured) toast.error("Add the PayMongo secret key before syncing plans.");
      else {
        const label: Record<string, string> = {
          synced: "synced",
          already_synced: "already synced",
          free: "free (no sync needed)",
          error: "failed",
        };
        const lines = (res.results ?? []).map(
          (r: any) =>
            `${r.name}: ${label[r.status]}${r.providerPlanId ? ` (${r.providerPlanId})` : ""}${r.error ? ` — ${r.error}` : ""}`,
        );
        const opts = { description: lines.join("\n"), duration: 12000 };
        if (res.error) toast.error(`Some plans failed to sync (${res.mode} mode)`, opts);
        else toast.success(`Plans synced to PayMongo (${res.mode} mode)`, opts);
      }
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setPending(null);
    }
  }

  if (sub.loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing & Subscription" description="Loading your plan..." />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (sub.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing & Subscription" />
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t load your subscription.
            </p>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw className="size-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Subscription"
        description="Your plan, invoices and payment status."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
            <Button asChild size="sm">
              <Link to="/upgrade">
                <Sparkles className="size-4" /> Upgrade plan
              </Link>
            </Button>
          </div>
        }
      />

      {sub.pastDue && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          <span className="min-w-0 flex-1">
            Your last payment failed. Update billing within the grace period to keep Pro features.
          </span>
          <Button size="sm" onClick={() => choosePlan(currentPlan?.slug ?? "pro")}>
            Retry payment
          </Button>
        </div>
      )}

      {sub.readOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          <span className="min-w-0 flex-1">
            Your workspace is {STATUS_LABEL[sub.status].toLowerCase()}. New transactions are paused,
            but all of your data is intact and exportable. Resubscribe to restore full access.
          </span>
        </div>
      )}

      {sub.isTrialing && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          <Sparkles className="size-4 text-primary" />
          <span className="min-w-0 flex-1">
            You&apos;re on the Pro trial — {sub.trialDaysLeft} day
            {sub.trialDaysLeft === 1 ? "" : "s"} left. It ends {formatDate(record?.trial_ends_at)},
            after which the workspace moves to Free unless you subscribe.
          </span>
        </div>
      )}

      {/* Current plan */}
      <Card className="shadow-elevate-2">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Current plan</CardTitle>
          <Badge variant={STATUS_TONE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Plan" value={currentPlan?.name ?? "Free"} />
          <Detail
            label="Monthly price"
            value={currentPlan ? `${formatPHP(Number(currentPlan.price))} / month` : "₱0"}
          />
          <Detail
            label={sub.isTrialing ? "Trial ends" : "Next billing date"}
            value={formatDate(sub.isTrialing ? record?.trial_ends_at : record?.current_period_end)}
          />
          <Detail
            label="Payment method"
            value={
              record?.payment_method_last4
                ? `${record.payment_method_brand ?? "Card"} •••• ${record.payment_method_last4}`
                : "None on file"
            }
          />
          {record?.pending_plan_id && (
            <Detail
              label="Scheduled change"
              value={`Effective ${formatDate(record.pending_plan_effective_at)}`}
            />
          )}
        </CardContent>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {record?.cancel_at_period_end ? (
            <Button onClick={doResume} disabled={pending !== null || !isAdmin}>
              {pending === "resume" && <Loader2 className="size-4 animate-spin" />} Resume
              subscription
            </Button>
          ) : (
            currentPlan?.slug !== "free" && (
              <Button
                variant="outline"
                onClick={() => setConfirmCancel(true)}
                disabled={pending !== null || !isAdmin}
              >
                Cancel subscription
              </Button>
            )
          )}
          {!isAdmin && (
            <p className="self-center text-xs text-muted-foreground">
              Only owners and admins can change billing.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compare plans</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan?.id;
            const recommended = plan.slug === "pro";
            const upgrade =
              Number(plan.price) > Number(currentPlan?.price ?? 0) ? "Upgrade" : "Switch";
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-xl border border-border p-5",
                  recommended && "border-primary/60 shadow-elevate-2",
                )}
              >
                {recommended && (
                  <Badge className="absolute -top-3 left-5 gap-1">
                    <Sparkles className="size-3" /> Recommended
                  </Badge>
                )}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {formatPHP(Number(plan.price))}
                  <span className="text-sm font-normal text-muted-foreground"> /month</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {(PLAN_HIGHLIGHTS[plan.slug] ?? []).map((line) => (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-5 w-full"
                  variant={recommended && !isCurrent ? "default" : "outline"}
                  disabled={isCurrent || pending !== null || !isAdmin}
                  onClick={() => choosePlan(plan.slug)}
                >
                  {pending === plan.slug && <Loader2 className="size-4 animate-spin" />}
                  {isCurrent ? "Your plan" : `${upgrade} to ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Billing history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing history</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : historyQuery.isError ? (
            <div className="space-y-2 py-6 text-center text-sm text-muted-foreground">
              <p>Couldn&apos;t load billing history.</p>
              <Button variant="outline" size="sm" onClick={() => void historyQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (historyQuery.data?.payments.length ?? 0) === 0 &&
            (historyQuery.data?.invoices.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payments yet. Charges appear here once a paid plan starts.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(historyQuery.data?.invoices ?? []).map((inv: any) => (
                  <TableRow key={`i-${inv.id}`}>
                    <TableCell>{formatDate(inv.created_at)}</TableCell>
                    <TableCell>{inv.invoice_number ?? "Invoice"}</TableCell>
                    <TableCell>{formatMoney(Number(inv.amount), inv.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "outline"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(historyQuery.data?.payments ?? []).map((p: any) => (
                  <TableRow key={`p-${p.id}`}>
                    <TableCell>{formatDate(p.paid_at ?? p.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.failure_reason ?? "Payment"}
                    </TableCell>
                    <TableCell>{formatMoney(Number(p.amount), p.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "paid" ? "default" : "destructive"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diagnostics */}
      {isAdmin && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="size-4" /> Billing diagnostics
            </CardTitle>
            <Badge variant="outline">
              {diagQuery.data?.mode === "live" ? "Live mode" : "Test mode"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-xs text-muted-foreground">
              Configuration status only — no keys or payment details are ever shown here.
            </p>
            {diagQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Flag
                  ok={!!diagQuery.data?.secretKeyMatchesMode}
                  label={`Secret key present for ${diagQuery.data?.mode ?? "?"} mode`}
                />
                <Flag ok={!!diagQuery.data?.publicKeyConfigured} label="PAYMONGO_PUBLIC_KEY" />
                <Flag
                  ok={!!diagQuery.data?.webhookSecretConfigured}
                  label={`Webhook signing secret present${diagQuery.data?.webhookSecretSource ? ` (${diagQuery.data.webhookSecretSource})` : ""}`}
                />
                <Flag
                  ok={!!diagQuery.data?.lastVerifiedWebhookAt}
                  label={diagQuery.data?.lastVerifiedWebhookAt ? `Last verified webhook: ${new Date(diagQuery.data.lastVerifiedWebhookAt).toLocaleString()}` : "No verified webhook received yet"}
                />
                <Flag
                  ok={!!diagQuery.data?.recurringBillingReady}
                  label="Automatic monthly billing (not enabled — QR Ph is one-time)"
                />
                <Flag ok={!!diagQuery.data?.customerLinked} label="PayMongo customer linked" />
                <Flag
                  ok={!!diagQuery.data?.subscriptionLinked}
                  label="PayMongo subscription linked"
                />
              </div>
            )}
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={doSyncPlans} disabled={pending !== null}>
                {pending === "sync" && <Loader2 className="size-4 animate-spin" />}
                <CreditCard className="size-4" /> Sync plans to PayMongo
              </Button>
              <p className="text-xs text-muted-foreground">
                PayMongo requires separate activation for automated subscriptions (cards and Maya).
                Until that is approved, recurring billing stays inactive.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep access until the end of the current billing period, then the workspace moves
              to the Free plan. Nothing is deleted — all records stay readable and exportable, and
              you can resubscribe anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep plan</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>Cancel subscription</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("size-2 rounded-full", ok ? "bg-emerald-500" : "bg-muted-foreground/40")}
      />
      <span className={cn("text-sm", !ok && "text-muted-foreground")}>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {ok ? "Configured" : "Not configured"}
      </span>
    </div>
  );
}
