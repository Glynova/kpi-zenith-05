/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_shell/analytics")({
  head: () => ({
    meta: [
      { title: "KPI Analytics — KPIOptiva" },
      { name: "description", content: "Margin, turnover, ROI, dead stock and business health KPIs." },
      { property: "og:title", content: "KPI Analytics — KPIOptiva" },
      { property: "og:description", content: "Margin, turnover, ROI, dead stock and business health KPIs." },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const { businessId, currency } = useBusiness();

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [sales, expenses, products, customers, cash, ar, ap] = await Promise.all([
        db.from("sales").select("*").eq("business_id", businessId),
        db.from("expenses").select("*").eq("business_id", businessId),
        db.from("products").select("*").eq("business_id", businessId),
        db.from("customers").select("*").eq("business_id", businessId),
        db.from("cash_transactions").select("*").eq("business_id", businessId),
        db.from("accounts_receivable").select("*").eq("business_id", businessId),
        db.from("accounts_payable").select("*").eq("business_id", businessId),
      ]);
      return {
        sales: (sales.data ?? []) as Row[],
        expenses: (expenses.data ?? []) as Row[],
        products: (products.data ?? []) as Row[],
        customers: (customers.data ?? []) as Row[],
        cash: (cash.data ?? []) as Row[],
        ar: (ar.data ?? []) as Row[],
        ap: (ap.data ?? []) as Row[],
      };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="KPI Analytics" description="Calculating your performance metrics..." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sum = (rows: Row[], key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
  const revenue = sum(data.sales, "total");
  const cogs = sum(data.sales, "cost_total");
  const expenseTotal = sum(data.expenses, "amount");
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseTotal;
  const inventoryValue = data.products.reduce(
    (a, p) => a + Number(p.stock ?? 0) * Number(p.cost_price ?? 0),
    0,
  );
  const turnover = inventoryValue > 0 ? cogs / inventoryValue : 0;
  const deadStock = data.products.filter((p) => Number(p.stock) > 0).length;
  const aov = data.sales.length ? revenue / data.sales.length : 0;
  const clv = data.customers.length ? revenue / data.customers.length : 0;
  const cashIn = sum(data.cash.filter((c) => c.type === "in"), "amount");
  const cashOut = sum(data.cash.filter((c) => c.type === "out"), "amount");
  const receivables = sum(data.ar, "amount") - sum(data.ar, "paid");
  const payables = sum(data.ap, "amount") - sum(data.ap, "paid");
  const currentRatio = payables > 0 ? (inventoryValue + receivables + (cashIn - cashOut)) / payables : 0;
  const roi = expenseTotal + cogs > 0 ? (netProfit / (expenseTotal + cogs)) * 100 : 0;

  const kpis = [
    { label: "Revenue", value: formatCurrency(revenue, currency) },
    { label: "Gross Profit", value: formatCurrency(grossProfit, currency) },
    { label: "Net Profit", value: formatCurrency(netProfit, currency) },
    { label: "Profit Margin", value: formatPercent(revenue ? (netProfit / revenue) * 100 : 0) },
    { label: "Expense Ratio", value: formatPercent(revenue ? (expenseTotal / revenue) * 100 : 0) },
    { label: "Inventory Turnover", value: `${turnover.toFixed(2)}x` },
    { label: "Products In Stock", value: formatNumber(deadStock) },
    { label: "Average Order Value", value: formatCurrency(aov, currency) },
    { label: "Customer Lifetime Value", value: formatCurrency(clv, currency) },
    { label: "Cash Flow Ratio", value: cashOut ? (cashIn / cashOut).toFixed(2) : "—" },
    { label: "Current Ratio", value: currentRatio ? currentRatio.toFixed(2) : "—" },
    { label: "ROI", value: formatPercent(roi) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Analytics"
        description="Every metric recalculated from live transactions."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {k.label}
              </p>
              <p className="mt-3 truncate font-display text-2xl font-semibold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
