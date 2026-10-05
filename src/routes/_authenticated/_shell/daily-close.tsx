import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDateTime, todayISO, titleCase } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MONEY: [string, string][] = [
  ["gross_sales", "Gross sales"],
  ["discounts", "Discounts"],
  ["vatable_sales", "VATable sales"],
  ["vat_amount", "VAT"],
  ["vat_exempt_sales", "VAT-exempt sales"],
  ["zero_rated_sales", "Zero-rated sales"],
  ["non_vat_sales", "Non-VAT sales"],
  ["voids", "Voids"],
  ["refunds", "Refunds"],
  ["net_sales", "Net sales"],
  ["beginning_grand_total", "Beginning grand total"],
  ["ending_grand_total", "Ending grand total"],
];

export const Route = createFileRoute("/_authenticated/_shell/daily-close")({
  head: () => ({
    meta: [
      { title: "Daily Close (Z Reading) — Daraven ERP" },
      { name: "description", content: "Close the day with a numbered Z reading that matches posted sales." },
      { property: "og:title", content: "Daily Close (Z Reading) — Daraven ERP" },
      { property: "og:description", content: "Close the day with a numbered Z reading that matches posted sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailyClosePage,
});

function DailyClosePage() {
  const { businessId, currency, role } = useBusiness();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const canClose = ["owner", "admin", "manager"].includes(String(role));

  const preview = useQuery({
    queryKey: ["z-preview", businessId, date],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db.rpc("z_reading_preview", { _business_id: businessId, _date: date });
      if (error) throw error;
      return data as Row;
    },
  });
  const history = useQuery({
    queryKey: ["z-history", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("z_readings")
        .select("*")
        .eq("business_id", businessId)
        .order("reading_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const closed = history.data?.find((z) => z.reading_date === date && !z.register_id);
  const close = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("close_day_z", { _business_id: businessId, _date: date });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Day closed. The Z reading is saved and can't be changed.");
      qc.invalidateQueries({ queryKey: ["z-history", businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = closed ?? preview.data ?? {};
  const pays = Object.entries((p.payment_totals ?? {}) as Record<string, number>);

  return (
    <div className="space-y-6">
      <PageHeader title="Daily Close" description="Z reading from posted sales. Once closed, a day's reading can't be edited." />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs" htmlFor="zdate">Day</Label>
          <Input id="zdate" type="date" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {closed ? (
          <span className="text-sm text-muted-foreground">Closed as Z #{closed.z_number} on {formatDateTime(closed.created_at)}</span>
        ) : (
          <Button disabled={!canClose || close.isPending} onClick={() => close.mutate()}>
            {close.isPending ? "Closing…" : "Close this day"}
          </Button>
        )}
        {!canClose && !closed && <span className="text-xs text-muted-foreground">Only owners, admins and managers can close the day.</span>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{closed ? `Z reading #${closed.z_number}` : "Preview"}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Receipts {p.beginning_invoice ?? "—"} to {p.ending_invoice ?? "—"} · {p.transaction_count ?? 0} sales · {p.void_count ?? 0} voided
          </p>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {MONEY.map(([k, label]) => (
            <div key={k} className="flex justify-between border-b border-border/50 py-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{formatCurrency(p[k], currency)}</span>
            </div>
          ))}
          {pays.map(([m, v]) => (
            <div key={m} className="flex justify-between border-b border-border/50 py-1">
              <span className="text-muted-foreground">Paid by {titleCase(m)}</span>
              <span className="tabular-nums">{formatCurrency(v, currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Past readings</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Z #</TableHead>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Net sales</TableHead>
                <TableHead className="text-right">Ending grand total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history.data ?? []).map((z) => (
                <TableRow key={z.id} className="cursor-pointer" onClick={() => setDate(z.reading_date)}>
                  <TableCell>{z.z_number}</TableCell>
                  <TableCell>{z.reading_date}</TableCell>
                  <TableCell className="text-right">{z.transaction_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(z.net_sales, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(z.ending_grand_total, currency)}</TableCell>
                </TableRow>
              ))}
              {!history.data?.length && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">No days closed yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
