/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, MousePointerClick, TrendingUp, Users, Wallet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartnerDashboard } from "@/lib/use-affiliate";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/affiliate/")({
  head: () => ({
    meta: [
      { title: "Partner Overview — Daraven ERP" },
      { name: "description", content: "Your referrals, conversions and commission balance." },
      { property: "og:title", content: "Partner Overview — Daraven ERP" },
      {
        property: "og:description",
        content: "Your referrals, conversions and commission balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerOverview,
});

function PartnerOverview() {
  const { data, isLoading } = usePartnerDashboard();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const t = data.totals as any;
  const converted = (data.referrals as any[]).filter((r) =>
    ["paid", "active"].includes(r.status),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${(data.partner as any).display_name}`}
        description={`Your commission rate is ${(data.partner as any).commission_rate}% on collected subscription revenue.`}
        actions={
          <Button asChild>
            <Link to="/affiliate/link">Get your referral link</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Clicks" value={data.clicks as number} icon={MousePointerClick} />
        <StatCard
          label="Referrals"
          value={(data.referrals as any[]).length}
          hint={`${converted} converted`}
          icon={Users}
        />
        <StatCard label="This month" value={peso(t.thisMonth)} icon={TrendingUp} />
        <StatCard label="Unpaid balance" value={peso(t.pending)} icon={Coins} />
        <StatCard label="Lifetime paid" value={peso(t.paid)} icon={Wallet} />
      </div>

      <DataCard
        title="Recent commissions"
        description="Earned on collected revenue, after any promo discount."
        columns={["Date", "Type", "Net revenue", "Rate", "Commission", "Status"]}
        rows={(data.commissions as any[]).slice(0, 10)}
        empty={{
          title: "No commissions yet",
          description: "Commissions appear here once a referred business pays its first invoice.",
        }}
        renderRow={(row: any) => (
          <TableRow key={row.id}>
            <TableCell>{shortDate(row.created_at)}</TableCell>
            <TableCell className="capitalize">{row.entry_type}</TableCell>
            <TableCell>{peso(row.net_amount)}</TableCell>
            <TableCell>{row.commission_rate}%</TableCell>
            <TableCell
              className={
                row.commission_amount < 0 ? "text-destructive tabular-nums" : "tabular-nums"
              }
            >
              {peso(row.commission_amount)}
            </TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
          </TableRow>
        )}
      />

      <DataCard
        title="Latest referrals"
        columns={["Referred", "Status", "Source"]}
        rows={(data.referrals as any[]).slice(0, 8)}
        empty={{
          title: "No referrals yet",
          description: "Share your link — signups are attributed automatically.",
        }}
        renderRow={(row: any) => (
          <TableRow key={row.id}>
            <TableCell>{shortDate(row.created_at)}</TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{row.source ?? "link"}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
