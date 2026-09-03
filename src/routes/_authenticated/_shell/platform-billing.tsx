/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, formatPHP, STATUS_LABEL, STATUS_TONE } from "@/lib/billing";
import { amIPlatformAdmin, platformBillingOverview } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/_shell/platform-billing")({
  head: () => ({
    meta: [
      { title: "Platform billing — Daraven ERP" },
      { name: "description", content: "Internal overview of workspaces, plans and MRR." },
      { property: "og:title", content: "Platform billing — Daraven ERP" },
      { property: "og:description", content: "Internal subscription and revenue overview." },
    ],
  }),
  component: PlatformBilling,
});

function PlatformBilling() {
  const checkAdmin = useServerFn(amIPlatformAdmin);
  const overviewFn = useServerFn(platformBillingOverview);

  const adminQuery = useQuery({ queryKey: ["platform-admin"], queryFn: () => checkAdmin() });
  const isAdmin = adminQuery.data?.isPlatformAdmin ?? false;

  const overview = useQuery({
    queryKey: ["platform-billing"],
    enabled: isAdmin,
    queryFn: () => overviewFn(),
  });

  if (adminQuery.isLoading) return <Skeleton className="h-64 w-full" />;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <ShieldAlert className="mx-auto size-10 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold">Internal area</h1>
        <p className="text-sm text-muted-foreground">
          This billing console is restricted to platform administrators.
        </p>
      </div>
    );
  }

  const data = overview.data;
  const subs = (data?.subscriptions ?? []) as any[];
  const counts = {
    active: subs.filter((s) => s.status === "active").length,
    trialing: subs.filter((s) => s.status === "trialing").length,
    problem: subs.filter((s) => ["past_due", "unpaid", "suspended"].includes(s.status)).length,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Platform billing" description="Workspaces, plans, trials and revenue." />

      {overview.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : overview.isError ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p>Couldn&apos;t load platform billing.</p>
            <Button variant="outline" onClick={() => void overview.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="MRR" value={formatPHP(Number(data?.mrr ?? 0))} />
            <Stat label="Active subscriptions" value={String(counts.active)} />
            <Stat label="Trials" value={String(counts.trialing)} />
            <Stat label="Past due / unpaid" value={String(counts.problem)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspaces</CardTitle>
            </CardHeader>
            <CardContent>
              {subs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No subscriptions yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Trial ends</TableHead>
                      <TableHead>Renews</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.business_name}</TableCell>
                        <TableCell>
                          {s.plan_name} · {formatPHP(s.plan_price)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_TONE[s.status as keyof typeof STATUS_TONE]}>
                            {STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] ?? s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(s.trial_ends_at)}</TableCell>
                        <TableCell>{formatDate(s.current_period_end)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent payment events</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.payments ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.payments ?? []).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.paid_at ?? p.created_at)}</TableCell>
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
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="surface-card">
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
