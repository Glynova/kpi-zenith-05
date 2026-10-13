import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, todayISO, titleCase } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_shell/tax")({
  head: () => ({
    meta: [
      { title: "Tax Records — Daraven ERP" },
      {
        name: "description",
        content: "VAT, exempt, zero-rated and withholding tax records with certificate exports.",
      },
      { property: "og:title", content: "Tax Records — Daraven ERP" },
      {
        property: "og:description",
        content: "VAT, exempt, zero-rated and withholding tax records with certificate exports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaxPage,
});

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

function printCertificate(c: Row, currency: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.certificate_number ?? "Certificate")}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #999;padding:6px;font-size:13px;text-align:left}.n{font-size:11px;color:#555;border:1px dashed #999;padding:8px;margin-top:16px}</style></head><body>
<h1>Certificate of Creditable Tax Withheld at Source (${esc(c.form_code)} format)</h1>
<div class="n">Generated from your records in Daraven. This is not a BIR-issued form. Check it against the current official form before filing or giving it to the payee.</div>
<table><tr><th>Period</th><td>${esc(c.period_from)} to ${esc(c.period_to)}</td><th>Certificate no.</th><td>${esc(c.certificate_number)}</td></tr>
<tr><th>Payee</th><td>${esc(c.payee_name)}</td><th>Payee TIN</th><td>${esc(c.payee_tin)}</td></tr>
<tr><th>Payer (withholding agent)</th><td>${esc(c.payer_name)}</td><th>Payer TIN</th><td>${esc(c.payer_tin)}</td></tr></table>
<table><tr><th>ATC</th><th>Income payment</th><th>Amount</th><th>Rate</th><th>Tax withheld</th></tr>
<tr><td>${esc(c.atc)}</td><td>${esc(c.income_description)}</td><td>${esc(formatCurrency(c.taxable_amount, currency))}</td><td>${esc(c.rate)}%</td><td>${esc(formatCurrency(c.withholding_amount, currency))}</td></tr></table>
<p style="margin-top:40px">______________________<br/>Signature over printed name</p>
<script>window.print()</script></body></html>`);
  w.document.close();
}

function TaxPage() {
  const { businessId, currency, canWrite, isAdmin, business } = useBusiness();
  const qc = useQueryClient();
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Row>({});

  const txns = useQuery({
    queryKey: ["tax-txns", businessId, from, to],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("tax_transactions")
        .select("*")
        .eq("business_id", businessId)
        .gte("txn_date", from)
        .lte("txn_date", to)
        .order("txn_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const certs = useQuery({
    queryKey: ["wht", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("withholding_certificates")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const summary = (txns.data ?? []).reduce<Record<string, { base: number; tax: number }>>(
    (acc, t) => {
      const k = t.tax_type as string;
      acc[k] ??= { base: 0, tax: 0 };
      acc[k].base += Number(t.taxable_amount);
      acc[k].tax += Number(t.tax_amount);
      return acc;
    },
    {},
  );

  const add = useMutation({
    mutationFn: async () => {
      const base = Number(f.taxable_amount);
      const rate = Number(f.rate);
      if (!f.payer_name || !f.atc || !(base >= 0) || !(rate >= 0))
        throw new Error("Fill in payer, ATC, amount and rate");
      const { error } = await db.from("withholding_certificates").insert({
        business_id: businessId,
        direction: "received",
        payer_name: f.payer_name,
        payer_tin: f.payer_tin || null,
        payee_name: business?.name ?? "This business",
        payee_tin: f.payee_tin || null,
        atc: f.atc,
        income_description: f.income_description || null,
        taxable_amount: base,
        rate,
        withholding_amount: Math.round(base * rate) / 100,
        period_from: f.period_from || from,
        period_to: f.period_to || to,
        certificate_number: f.certificate_number || null,
        reference: f.reference || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withholding recorded");
      setOpen(false);
      setF({});
      qc.invalidateQueries({ queryKey: ["wht", businessId] });
      qc.invalidateQueries({ queryKey: ["tax-txns", businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function voidCert(c: Row) {
    const { error } = await db
      .from("withholding_certificates")
      .update({ status: "void" })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Certificate voided");
    qc.invalidateQueries({ queryKey: ["wht", businessId] });
    qc.invalidateQueries({ queryKey: ["tax-txns", businessId] });
  }

  const field = (k: string, label: string, type = "text") => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="mt-1.5"
        type={type}
        value={f[k] ?? ""}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Records"
        description="Tax recorded automatically when sales post, plus tax your customers withheld."
        actions={
          canWrite && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Record withholding
            </Button>
          )
        }
      />
      <div className="page-toolbar">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="mt-1.5"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="mt-1.5"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {["VAT", "VAT_EXEMPT", "ZERO_RATED", "WITHHOLDING"].map((k) => (
          <Card key={k}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{titleCase(k.toLowerCase())}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatCurrency(
                  k === "VAT" || k === "WITHHOLDING" ? summary[k]?.tax : summary[k]?.base,
                  currency,
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                on {formatCurrency(summary[k]?.base, currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withholding certificates (2307 format)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Payer</TableHead>
                <TableHead>ATC</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Withheld</TableHead>
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(certs.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">
                    {c.period_from} – {c.period_to}
                  </TableCell>
                  <TableCell>
                    {c.payer_name}
                    <div className="text-xs text-muted-foreground">{c.payer_tin}</div>
                  </TableCell>
                  <TableCell>{c.atc}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(c.taxable_amount, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(c.withholding_amount, currency)}
                  </TableCell>
                  <TableCell>
                    {c.status === "void" && <Badge variant="secondary">Void</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Print"
                      onClick={() => printCertificate(c, currency)}
                    >
                      <Printer className="size-4" />
                    </Button>
                    {isAdmin && c.status !== "void" && (
                      <Button variant="ghost" size="sm" onClick={() => voidCert(c)}>
                        Void
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!certs.data?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    No certificates recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax entries</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Customer / party</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(txns.data ?? []).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.txn_date}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{titleCase(String(t.tax_type).toLowerCase())}</Badge>
                  </TableCell>
                  <TableCell>
                    {t.reference}
                    <div className="text-xs text-muted-foreground">
                      {titleCase(String(t.source_type))}
                    </div>
                  </TableCell>
                  <TableCell>{t.counterparty_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(t.taxable_amount, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(t.tax_amount, currency)}
                  </TableCell>
                </TableRow>
              ))}
              {!txns.data?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No tax entries in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record tax withheld by a customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("payer_name", "Customer (payer) *")}
            {field("payer_tin", "Customer TIN")}
            {field("payee_tin", "Your TIN")}
            {field("atc", "ATC code *")}
            {field("income_description", "Income payment")}
            {field("certificate_number", "Certificate no.")}
            {field("taxable_amount", "Amount of payment *", "number")}
            {field("rate", "Rate (%) *", "number")}
            {field("period_from", "Period from", "date")}
            {field("period_to", "Period to", "date")}
            {field("reference", "Invoice / reference")}
          </div>
          <p className="text-xs text-muted-foreground">
            Tax withheld:{" "}
            {formatCurrency(
              ((Number(f.taxable_amount) || 0) * (Number(f.rate) || 0)) / 100,
              currency,
            )}
            . Recorded certificates can't be edited; void and record again to correct.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
