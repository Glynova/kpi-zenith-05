/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartnerDashboard } from "@/lib/use-affiliate";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/affiliate/payouts")({
  head: () => ({
    meta: [
      { title: "Partner Payouts — Daraven ERP" },
      { name: "description", content: "Your payout batches and settlement status." },
      { property: "og:title", content: "Partner Payouts — Daraven ERP" },
      { property: "og:description", content: "Your payout batches and settlement status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutsPage,
});

function PayoutsPage() {
  const { data, isLoading } = usePartnerDashboard();
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const partner = data.partner as any;
  const t = data.totals as any;
  const threshold = Number(partner.payout_threshold ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description={`Payouts are issued once your unpaid balance reaches ${peso(threshold)}.`}
        actions={
          <Button asChild variant="outline">
            <Link to="/affiliate/settings">Payout details</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Unpaid balance" value={peso(t.pending)} />
        <StatCard label="Payout threshold" value={peso(threshold)} />
        <StatCard
          label="Method"
          value={partner.payout_method ? String(partner.payout_method) : "Not set"}
          hint={partner.payout_method ? undefined : "Add one in settings"}
        />
      </div>

      <DataCard
        title="Payout history"
        columns={["Requested", "Period", "Amount", "Method", "Reference", "Status", "Paid"]}
        rows={data.payouts as any[]}
        empty={{
          title: "No payouts yet",
          description:
            "Approved commissions are batched into a payout once you pass the threshold.",
        }}
        renderRow={(row: any) => (
          <TableRow key={row.id}>
            <TableCell>{shortDate(row.created_at)}</TableCell>
            <TableCell className="text-muted-foreground">
              {shortDate(row.period_start)} – {shortDate(row.period_end)}
            </TableCell>
            <TableCell className="tabular-nums font-medium">{peso(row.amount)}</TableCell>
            <TableCell className="capitalize">{row.method ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {row.reference ?? "—"}
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell>{shortDate(row.paid_at)}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
