/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSubscriptions } from "@/lib/platform-admin.functions";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: AdminSubscriptions,
});

function AdminSubscriptions() {
  const fetchSubs = useServerFn(adminSubscriptions);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => fetchSubs(),
  });
  const [q, setQ] = useState("");

  const subs = useMemo(() => {
    const all = (data?.subscriptions ?? []) as any[];
    const term = q.trim().toLowerCase();
    return term
      ? all.filter((s) =>
          `${s.business_name} ${s.plan_name} ${s.status}`.toLowerCase().includes(term),
        )
      : all;
  }, [data, q]);

  const totals = useMemo(() => {
    const all = (data?.subscriptions ?? []) as any[];
    const active = all.filter((s) => s.status === "active");
    return {
      active: active.length,
      trialing: all.filter((s) => s.status === "trialing").length,
      pastDue: all.filter((s) => s.status === "past_due" || s.status === "unpaid").length,
      mrr: Math.round(active.reduce((sum, s) => sum + Number(s.plan_price ?? 0), 0) * 100) / 100,
    };
  }, [data]);

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Every plan, invoice and payment recorded across the platform."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value={totals.active} />
        <StatCard label="Trialing" value={totals.trialing} />
        <StatCard label="Past due" value={totals.pastDue} />
        <StatCard label="MRR" value={peso(totals.mrr)} hint="Active plans at list price" />
      </div>

      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions">
          <DataCard
            title={`${subs.length} subscriptions`}
            actions={
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search workspace or plan…"
                className="w-56"
              />
            }
            columns={["Workspace", "Plan", "Status", "Price", "Period ends", "Started"]}
            rows={subs}
            empty={{ title: "No subscriptions yet" }}
            renderRow={(s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.business_name}</TableCell>
                <TableCell>{s.plan_name}</TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className="tabular-nums">{peso(s.plan_price)}</TableCell>
                <TableCell>{shortDate(s.current_period_end ?? s.trial_ends_at)}</TableCell>
                <TableCell className="text-muted-foreground">{shortDate(s.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <DataCard
            title="Recent invoices"
            columns={["Workspace", "Invoice", "Amount", "Status", "Due", "Paid"]}
            rows={(data.invoices ?? []) as any[]}
            empty={{ title: "No invoices yet" }}
            renderRow={(i: any) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.business_name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {i.invoice_number ?? i.external_invoice_id ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">{peso(i.amount)}</TableCell>
                <TableCell>
                  <StatusBadge status={i.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{shortDate(i.due_date)}</TableCell>
                <TableCell className="text-muted-foreground">{shortDate(i.paid_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>

        <TabsContent value="payments">
          <DataCard
            title="Recent payments"
            columns={["Workspace", "Amount", "Status", "Reference", "Date"]}
            rows={(data.payments ?? []) as any[]}
            empty={{ title: "No payments yet" }}
            renderRow={(p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.business_name}</TableCell>
                <TableCell className="tabular-nums">{peso(p.amount)}</TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {p.paymongo_payment_id ?? p.reference ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{shortDate(p.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
