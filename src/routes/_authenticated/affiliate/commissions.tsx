/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePartnerDashboard } from "@/lib/use-affiliate";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/affiliate/commissions")({
  component: CommissionsPage,
});

const FILTERS = ["all", "pending", "approved", "paid", "reversed", "cancelled"];

function CommissionsPage() {
  const { data, isLoading } = usePartnerDashboard();
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    const all = (data?.commissions ?? []) as any[];
    return filter === "all" ? all : all.filter((r) => r.status === filter);
  }, [data, filter]);

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  const t = data.totals as any;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commissions"
        description="Every earning, reversal and adjustment on your account."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lifetime" value={peso(t.lifetime)} />
        <StatCard label="Unpaid" value={peso(t.pending)} />
        <StatCard label="Paid out" value={peso(t.paid)} />
        <StatCard label="Reversed" value={peso(t.reversed)} hint="Refunds & chargebacks" />
      </div>

      <DataCard
        title="Ledger"
        actions={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f} value={f} className="capitalize">
                  {f === "all" ? "All statuses" : f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        columns={["Date", "Type", "Reference", "Net revenue", "Rate", "Commission", "Status"]}
        rows={rows}
        empty={{ title: "Nothing here yet", description: "No commission entries match this filter." }}
        renderRow={(row: any) => (
          <TableRow key={row.id}>
            <TableCell>{shortDate(row.created_at)}</TableCell>
            <TableCell className="capitalize">{row.entry_type}</TableCell>
            <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
              {row.external_reference ?? "—"}
            </TableCell>
            <TableCell className="tabular-nums">{peso(row.net_amount)}</TableCell>
            <TableCell>{row.commission_rate}%</TableCell>
            <TableCell
              className={
                Number(row.commission_amount) < 0
                  ? "tabular-nums text-destructive"
                  : "tabular-nums font-medium"
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
    </div>
  );
}
