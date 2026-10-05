import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, todayISO } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BUCKETS = [
  ["current_amt", "Current"],
  ["d1_30", "1–30"],
  ["d31_60", "31–60"],
  ["d61_90", "61–90"],
  ["d91_120", "91–120"],
  ["d121_plus", "121+"],
] as const;

export const Route = createFileRoute("/_authenticated/_shell/ar-aging")({
  head: () => ({
    meta: [
      { title: "Receivables Aging — Daraven ERP" },
      {
        name: "description",
        content: "Unpaid customer balances by days past due, as of any date.",
      },
      { property: "og:title", content: "Receivables Aging — Daraven ERP" },
      {
        property: "og:description",
        content: "Unpaid customer balances by days past due, as of any date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgingPage,
});

function AgingPage() {
  const { businessId, currency } = useBusiness();
  const [asOf, setAsOf] = useState(todayISO());
  const { data = [], isLoading } = useQuery({
    queryKey: ["ar-aging", businessId, asOf],
    enabled: !!businessId && !!asOf,
    queryFn: async () => {
      const { data, error } = await db.rpc("ar_aging", { _business_id: businessId, _as_of: asOf });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const totals = Object.fromEntries(
    [...BUCKETS.map((b) => b[0]), "total"].map((k) => [
      k,
      data.reduce((s, r) => s + Number(r[k] ?? 0), 0),
    ]),
  );

  function exportCsv() {
    const head = ["Customer", ...BUCKETS.map((b) => b[1]), "Total"];
    const rows = data.map((r) => [r.customer_name, ...BUCKETS.map((b) => r[b[0]]), r.total]);
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `ar-aging-${asOf}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receivables Aging"
        description="What customers still owe, grouped by days past the due date."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!data.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />
      <div className="max-w-xs">
        <Label className="text-xs" htmlFor="asof">
          As of date
        </Label>
        <Input
          id="asof"
          type="date"
          className="mt-1.5"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
        />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                {BUCKETS.map((b) => (
                  <TableHead key={b[0]} className="text-right">
                    {b[1]}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !data.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Nothing owed as of this date.
                  </TableCell>
                </TableRow>
              )}
              {data.map((r) => (
                <TableRow key={r.customer_id ?? "none"}>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  {BUCKETS.map((b) => (
                    <TableCell key={b[0]} className="text-right tabular-nums">
                      {Number(r[b[0]]) ? formatCurrency(r[b[0]], currency) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(r.total, currency)}
                  </TableCell>
                </TableRow>
              ))}
              {data.length > 0 && (
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total</TableCell>
                  {BUCKETS.map((b) => (
                    <TableCell key={b[0]} className="text-right font-semibold tabular-nums">
                      {formatCurrency(totals[b[0]], currency)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(totals.total, currency)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
