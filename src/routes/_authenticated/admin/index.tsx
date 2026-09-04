/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  Coins,
  CreditCard,
  Handshake,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { adminOverview } from "@/lib/platform-admin.functions";
import { peso } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Platform Overview — Daraven ERP" },
      { name: "description", content: "Platform-wide revenue, trials, past-due workspaces and affiliate commissions." },
      { property: "og:title", content: "Platform Overview — Daraven ERP" },
      { property: "og:description", content: "Platform-wide revenue, trials, past-due workspaces and affiliate commissions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const fetchOverview = useServerFn(adminOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        description="Live health of the Daraven ERP business: tenants, revenue and partner performance."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="MRR" value={peso(data.mrr)} icon={TrendingUp} />
        <StatCard
          label="Affiliate MRR"
          value={peso(data.affiliateMrr)}
          hint={`${data.referredBusinesses} referred businesses`}
          icon={Handshake}
        />
        <StatCard label="Active subscriptions" value={data.activeSubscriptions} icon={CreditCard} />
        <StatCard label="Trials" value={data.trials} />
        <StatCard label="Businesses" value={data.businesses} icon={Building2} />
        <StatCard label="Users" value={data.users} icon={Users} />
        <StatCard
          label="Past due / unpaid"
          value={data.pastDue}
          hint="Needs dunning follow-up"
          icon={AlertTriangle}
        />
        <StatCard
          label="Commissions owed"
          value={peso(data.pendingCommissions)}
          hint="Pending + approved"
          icon={Coins}
        />
      </div>
    </div>
  );
}
