import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { salesMetrics, inventoryValueOf, marginPercent } from "@/lib/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_shell/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Daraven ERP" },
      {
        name: "description",
        content: "Sales, expense, inventory, profit and payroll reporting with export.",
      },
      { property: "og:title", content: "Reports — Daraven ERP" },
      {
        property: "og:description",
        content: "Sales, expense, inventory, profit and payroll reporting with export.",
      },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { businessId, currency } = useBusiness();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [sales, expenses, products, payroll, ar, ap, saleItems, variants] = await Promise.all([
        db.from("sales").select("*").eq("business_id", businessId),
        db.from("expenses").select("*").eq("business_id", businessId),
        db.from("products").select("*").eq("business_id", businessId),
        db.from("payroll").select("*").eq("business_id", businessId),
        db.from("accounts_receivable").select("*").eq("business_id", businessId),
        db.from("accounts_payable").select("*").eq("business_id", businessId),
        db
          .from("sale_items")
          .select(
            "product_id,variant_id,product_name,sku,quantity,returned_quantity,unit_price,unit_cost,discount,total,sales(document_type,status,inventory_posted)",
          )
          .eq("business_id", businessId),
        db
          .from("product_variants")
          .select("id,product_id,name,sku,barcode,stock,cost_price,selling_price,status")
          .eq("business_id", businessId),
      ]);
      return {
        sales: (sales.data ?? []) as Row[],
        expenses: (expenses.data ?? []) as Row[],
        products: (products.data ?? []) as Row[],
        payroll: (payroll.data ?? []) as Row[],
        ar: (ar.data ?? []) as Row[],
        ap: (ap.data ?? []) as Row[],
        saleItems: (saleItems.data ?? []) as Row[],
        variants: (variants.data ?? []) as Row[],
      };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Loading your reporting data..." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sum = (rows: Row[], key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
  const m = salesMetrics(data.sales);
  const revenue = m.revenue;
  const cogs = m.cogs;
  const expenseTotal = sum(data.expenses, "amount");
  /**
   * Inventory value is variant-aware: when a product carries variants the value
   * comes from the variant rows only, so a parent and its variants are never
   * counted twice. Products without variants fall back to the shared helper.
   */
  const variantsByProduct = new Map<string, Row[]>();
  for (const v of data.variants) {
    const list = variantsByProduct.get(String(v.product_id)) ?? [];
    list.push(v);
    variantsByProduct.set(String(v.product_id), list);
  }
  const parentsWithoutVariants = data.products.filter(
    (p) => !(variantsByProduct.get(String(p.id))?.length ?? 0),
  );
  const variantInventoryValue = data.variants.reduce(
    (a, v) => a + Number(v.stock ?? 0) * Number(v.cost_price ?? 0),
    0,
  );
  const inventoryValue = inventoryValueOf(parentsWithoutVariants) + variantInventoryValue;

  /**
   * Item-level reporting keyed on the exact sellable identity (product + variant).
   * Quantities and money come from the immutable sale_item snapshot, so renamed
   * or archived variants still report under what was actually sold. Returns are
   * subtracted through returned_quantity and return documents are skipped so the
   * same movement is never counted twice.
   */
  const variantById = new Map(data.variants.map((v) => [String(v.id), v]));
  const productById = new Map(data.products.map((p) => [String(p.id), p]));
  const itemStats = new Map<string, Row>();
  for (const it of data.saleItems) {
    const parent = (it as Row).sales as Row | null;
    if (!parent) continue;
    const doc = String(parent.document_type ?? "sale");
    if (doc === "quote" || doc === "sales_order" || doc === "return") continue;
    if (
      ["draft", "voided", "cancelled", "rejected", "expired"].includes(String(parent.status ?? ""))
    )
      continue;

    const key = `${it.product_id}::${it.variant_id ?? ""}`;
    const variant = it.variant_id ? variantById.get(String(it.variant_id)) : null;
    const netQty = Number(it.quantity ?? 0) - Number(it.returned_quantity ?? 0);
    const price = Number(it.unit_price ?? 0);
    const cost = Number(it.unit_cost ?? 0);
    const row =
      itemStats.get(key) ??
      ({
        product_id: it.product_id,
        variant_id: it.variant_id ?? "",
        item: it.product_name ?? productById.get(String(it.product_id))?.name ?? "Unknown",
        variant: variant?.name ?? "",
        sku: it.sku ?? variant?.sku ?? productById.get(String(it.product_id))?.sku ?? "",
        barcode: variant?.barcode ?? productById.get(String(it.product_id))?.barcode ?? "",
        quantity_sold: 0,
        quantity_returned: 0,
        revenue: 0,
        cogs: 0,
        gross_profit: 0,
      } as Row);
    row.quantity_sold = Number(row.quantity_sold) + netQty;
    row.quantity_returned = Number(row.quantity_returned) + Number(it.returned_quantity ?? 0);
    row.revenue = Number(row.revenue) + netQty * price;
    row.cogs = Number(row.cogs) + netQty * cost;
    row.gross_profit = Number(row.revenue) - Number(row.cogs);
    itemStats.set(key, row);
  }
  const itemRows = Array.from(itemStats.values()).sort(
    (a, b) => Number(b.revenue) - Number(a.revenue),
  );
  const itemRevenue = itemRows.reduce((a, r) => a + Number(r.revenue), 0);

  const variantStockRows = data.variants.map((v) => ({
    variant_id: v.id,
    product: productById.get(String(v.product_id))?.name ?? "",
    variant: v.name,
    sku: v.sku ?? "",
    barcode: v.barcode ?? "",
    status: v.status ?? "active",
    stock: Number(v.stock ?? 0),
    unit_cost: Number(v.cost_price ?? 0),
    stock_value: Number(v.stock ?? 0) * Number(v.cost_price ?? 0),
  })) as unknown as Row[];
  const variantStockValue = variantStockRows.reduce((a, r) => a + Number(r.stock_value), 0);

  const reports = [
    {
      title: "Sales Report",
      rows: data.sales,
      value: formatCurrency(revenue, currency),
      note: `${m.orders} posted transactions`,
    },
    {
      title: "Expense Report",
      rows: data.expenses,
      value: formatCurrency(expenseTotal, currency),
      note: `${data.expenses.length} entries`,
    },
    {
      title: "Profit Report",
      rows: data.sales,
      value: formatCurrency(revenue - cogs - expenseTotal, currency),
      note: `Gross ${formatCurrency(revenue - cogs, currency)}`,
    },
    {
      title: "Inventory Report",
      rows: data.products,
      value: formatCurrency(inventoryValue, currency),
      note: `${formatNumber(data.products.length)} products`,
    },
    {
      title: "Payroll Report",
      rows: data.payroll,
      value: formatCurrency(sum(data.payroll, "net_pay"), currency),
      note: `${data.payroll.length} pay runs`,
    },
    {
      title: "Receivable Report",
      rows: data.ar,
      value: formatCurrency(sum(data.ar, "amount") - sum(data.ar, "paid"), currency),
      note: `${data.ar.length} open items`,
    },
    {
      title: "Payable Report",
      rows: data.ap,
      value: formatCurrency(sum(data.ap, "amount") - sum(data.ap, "paid"), currency),
      note: `${data.ap.length} open items`,
    },
    {
      title: "Item & Variant Sales Report",
      rows: itemRows,
      value: formatCurrency(itemRevenue, currency),
      note: `${formatNumber(itemRows.length)} items sold, returns deducted`,
    },
    {
      title: "Variant Stock Report",
      rows: variantStockRows,
      value: formatCurrency(variantStockValue, currency),
      note: `${formatNumber(variantStockRows.length)} variants tracked`,
    },
  ];

  function exportRows(name: string, rows: Row[]) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Board-ready summaries you can export in one click."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title}>
            <CardHeader>
              <CardTitle className="text-sm">{r.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-2xl font-semibold">{r.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={!r.rows.length}
                onClick={() => exportRows(r.title, r.rows)}
              >
                <Download className="size-4" /> Export CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
