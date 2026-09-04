/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartnerDashboard } from "@/lib/use-affiliate";
import { dateTime, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/affiliate/referrals")({
  component: ReferralsPage,
});

function ReferralsPage() {
  const { data, isLoading } = usePartnerDashboard();
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referrals"
        description="Every workspace attributed to you, from first click to paying customer."
      />
      <DataCard
        title="All referrals"
        columns={["Attributed", "Status", "Source", "Converted", "Last update"]}
        rows={data.referrals as any[]}
        empty={{
          title: "No referrals yet",
          description: "Signups through your link or promo codes appear here.",
        }}
        renderRow={(row: any) => (
          <TableRow key={row.id}>
            <TableCell>{shortDate(row.created_at)}</TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{row.source ?? "link"}</TableCell>
            <TableCell>{shortDate(row.converted_at)}</TableCell>
            <TableCell className="text-muted-foreground">{dateTime(row.updated_at)}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
