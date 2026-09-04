/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartnerDashboard } from "@/lib/use-affiliate";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/affiliate/customers")({
  head: () => ({
    meta: [
      { title: "Referred Customers — Daraven ERP" },
      { name: "description", content: "Paying customers attributed to your referrals." },
      { property: "og:title", content: "Referred Customers — Daraven ERP" },
      { property: "og:description", content: "Paying customers attributed to your referrals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data, isLoading } = usePartnerDashboard();
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const bizById = new Map((data.businesses as any[]).map((b) => [b.id, b]));
  const subByBiz = new Map((data.subscriptions as any[]).map((s) => [s.business_id, s]));
  const earnedByBiz = new Map<string, number>();
  for (const c of data.commissions as any[]) {
    if (!c.business_id) continue;
    earnedByBiz.set(c.business_id, (earnedByBiz.get(c.business_id) ?? 0) + Number(c.commission_amount ?? 0));
  }

  const rows = (data.referrals as any[]).filter((r) => r.business_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Businesses that signed up through you, with their current plan and what you've earned."
      />
      <DataCard
        title="Referred businesses"
        columns={["Business", "Plan", "Subscription", "Signed up", "Earned"]}
        rows={rows}
        empty={{
          title: "No customers yet",
          description: "A referral becomes a customer as soon as it creates a workspace.",
        }}
        renderRow={(row: any) => {
          const biz = bizById.get(row.business_id);
          const sub = subByBiz.get(row.business_id);
          return (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{biz?.name ?? "—"}</TableCell>
              <TableCell>{sub?.subscription_plans?.name ?? "Free"}</TableCell>
              <TableCell>
                <StatusBadge status={sub?.status ?? row.status} />
              </TableCell>
              <TableCell>{shortDate(biz?.created_at ?? row.created_at)}</TableCell>
              <TableCell className="tabular-nums">
                {peso(earnedByBiz.get(row.business_id) ?? 0)}
              </TableCell>
            </TableRow>
          );
        }}
      />
    </div>
  );
}
