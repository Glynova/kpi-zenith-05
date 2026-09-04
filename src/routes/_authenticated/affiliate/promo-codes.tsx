/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePartnerDashboard } from "@/lib/use-affiliate";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/affiliate/promo-codes")({
  head: () => ({
    meta: [
      { title: "Partner Promo Codes — Daraven ERP" },
      { name: "description", content: "Promo codes attributed to your partner account." },
      { property: "og:title", content: "Partner Promo Codes — Daraven ERP" },
      { property: "og:description", content: "Promo codes attributed to your partner account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnerPromoCodes,
});

function PartnerPromoCodes() {
  const { data, isLoading } = usePartnerDashboard();
  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo codes"
        description="Codes assigned to you by the Daraven team. Signups using them are attributed to you automatically."
      />
      <DataCard
        title="Your codes"
        columns={["Code", "Discount", "Applies", "Redemptions", "Valid until", "Status"]}
        rows={data.promoCodes as any[]}
        empty={{
          title: "No promo codes assigned",
          description: "Ask your partner manager for a branded discount code.",
        }}
        renderRow={(row: any) => (
          <TableRow key={row.id}>
            <TableCell>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 font-mono font-medium hover:text-primary"
                onClick={() => {
                  void navigator.clipboard.writeText(row.code);
                  toast.success("Code copied");
                }}
              >
                {row.code} <Copy className="size-3.5" />
              </button>
            </TableCell>
            <TableCell>
              {row.discount_type === "percentage"
                ? `${row.discount_value}%`
                : peso(row.discount_value)}
            </TableCell>
            <TableCell className="capitalize text-muted-foreground">
              {String(row.duration ?? "").replace(/_/g, " ")}
            </TableCell>
            <TableCell className="tabular-nums">
              {row.redemption_count ?? 0}
              {row.max_redemptions ? ` / ${row.max_redemptions}` : ""}
            </TableCell>
            <TableCell>{shortDate(row.ends_at)}</TableCell>
            <TableCell>
              <StatusBadge status={row.active ? "active" : "inactive"} />
            </TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
