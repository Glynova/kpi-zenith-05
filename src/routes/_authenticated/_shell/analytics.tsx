import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { addCalendarDays, dateInTimeZone, useBusinessDateRange } from "@/lib/date-range";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { salesMetrics, inventoryValueOf, healthScoreFromRecords, marginPercent } from "@/lib/kpi";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BusinessHealthCard } from "@/components/business-health-card";
import { DateRangePicker } from "@/components/date-range-picker";

export const Route = createFileRoute("/_authenticated/_shell/analytics")({
  head: () => ({
    meta: [
      { title: "KPI Analytics — Daraven ERP" },
      {
        name: "description",
        content: "Margin, turnover, ROI, dead stock and business health KPIs.",
      },
      { property: "og:title", content: "KPI Analytics — Daraven ERP" },
      {
        property: "og:description",
        content: "Margin, turnover, ROI, dead stock and business health KPIs.",
      },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const { businessId, currency, business } = useBusiness();
  const timezone = String(business?.timezone ?? "Asia/Manila");
  const { selection, range, setSelection, isResolvingAllTime, rangeError } = useBusinessDateRange(
    businessId,
    timezone,
  );
  const today = dateInTimeZone(new Date(), timezone);
  const inventoryFrom = addCalendarDays(today, -180);
  const inventorySalesFrom = addCalendarDays(today, -90);
  const aggregateRange = range.bucket === "month" || range.preset === "all";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", businessId, range.from, range.to, range.previousFrom],
    enabled: !!businessId && !isResolvingAllTime && !rangeError,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const [
        sales,
        expenses,
        products,
        variants,
        customers,
        cash,
        ar,
        ap,
        saleItems,
        movements,
        batches,
        history,
        healthSales,
        summary,
        previousSales,
        previousSummary,
      ] = await Promise.all([
        aggregateRange
          ? db.from("sales").select("id").eq("business_id", businessId).limit(0)
          : db
              .from("sales")
              .select("*")
              .eq("business_id", businessId)
              .gte("sale_date", range.fromDate)
              .lte("sale_date", range.toDate)
              .limit(5000),
        aggregateRange
          ? db.from("expenses").select("id").eq("business_id", businessId).limit(0)
          : db
              .from("expenses")
              .select("*")
              .eq("business_id", businessId)
              .gte("expense_date", range.fromDate)
              .lte("expense_date", range.toDate)
              .limit(5000),
        db.from("products").select("*").eq("business_id", businessId),
        db
          .from("product_variants")
          .select("id,product_id,stock,cost_price,status,created_at")
          .eq("business_id", businessId),
        db.from("customers").select("*").eq("business_id", businessId),
        db.from("cash_transactions").select("*").eq("business_id", businessId),
        db.from("accounts_receivable").select("*").eq("business_id", businessId),
        db.from("accounts_payable").select("*").eq("business_id", businessId),
        db
          .from("sale_items")
          .select("*,sales!inner(sale_date)")
          .eq("business_id", businessId)
          .gte("sales.sale_date", inventorySalesFrom)
          .lte("sales.sale_date", today)
          .limit(10000),
        db
          .from("inventory_movements")
          .select("product_id,variant_id,type,movement_date,created_at")
          .eq("business_id", businessId)
          .gte("movement_date", inventoryFrom),
        db
          .from("batches")
          .select("product_id,variant_id,remaining_quantity,unit_cost,expiry_date")
          .eq("business_id", businessId),
        db.from("sales").select("id").eq("business_id", businessId).limit(1),
        db
          .from("sales")
          .select("*")
          .eq("business_id", businessId)
          .gte("sale_date", inventorySalesFrom)
          .lte("sale_date", today),
        db.rpc("get_business_period_aggregate", {
          _business_id: businessId,
          _from: range.from,
          _to: range.to,
          _timezone: timezone,
          _bucket: range.bucket,
        }),
        range.previousFromDate && range.previousToDate
          ? aggregateRange
            ? db.rpc("get_business_period_aggregate", {
                _business_id: businessId,
                _from: range.previousFrom!,
                _to: range.previousTo!,
                _timezone: timezone,
                _bucket: range.bucket,
              })
            : db
                .from("sales")
                .select("*")
                .eq("business_id", businessId)
                .gte("sale_date", range.previousFromDate)
                .lte("sale_date", range.previousToDate)
                .limit(5000)
          : Promise.resolve({ data: aggregateRange ? null : [], error: null }),
      ]);
      if (history.error) throw history.error;
      if (healthSales.error) throw healthSales.error;
      if (summary.error && aggregateRange) throw summary.error;
      if (previousSales.error && range.previousFromDate) throw previousSales.error;
      if (sales.error) throw sales.error;
      if (expenses.error) throw expenses.error;
      if (cash.error) throw cash.error;
      if (saleItems.error) throw saleItems.error;
      if (movements.error) throw movements.error;
      if (batches.error) throw batches.error;
      if (products.error) throw products.error;
      if (variants.error) throw variants.error;
      if (ar.error) throw ar.error;
      if (ap.error) throw ap.error;
      return {
        sales: (sales.data ?? []) as Row[],
        expenses: (expenses.data ?? []) as Row[],
        products: (products.data ?? []) as Row[],
        variants: (variants.data ?? []) as Row[],
        customers: (customers.data ?? []) as Row[],
        cash: (cash.data ?? []) as Row[],
        ar: (ar.data ?? []) as Row[],
        ap: (ap.data ?? []) as Row[],
        saleItems: (saleItems.data ?? []) as Row[],
        movements: (movements.data ?? []) as Row[],
        batches: (batches.data ?? []) as Row[],
        salesHistory: (history.data ?? []) as Row[],
        healthSales: (healthSales.data ?? []) as Row[],
        summary: (summary.data ?? null) as Row | null,
        previousSales: (aggregateRange ? [] : (previousSales.data ?? [])) as Row[],
        previousSummary: (aggregateRange ? previousSales.data ?? null : null) as Row | null,
      };
    },
  });

  if (rangeError) {
    return (
      <div className="space-y-6">
        <PageHeader title="KPI Analytics" description="Could not resolve the selected date range." />
        <p className="text-sm text-destructive" role="status">{rangeError.message}</p>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="KPI Analytics" description="Could not load analytics data." />
        <p className="text-sm text-destructive" role="status">
          {error instanceof Error ? error.message : "Could not load analytics data."}
        </p>
      </div>
    );
  }
  if (isLoading || isResolvingAllTime || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="KPI Analytics" description="Calculating your performance metrics..." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const sum = (rows: Row[], key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
  const rawMetrics = salesMetrics(data.sales);
  const summarySales = data.summary?.sales as Row | undefined;
  const summaryExpenses = data.summary?.expenses as Row | undefined;
  const m = {
    ...rawMetrics,
    revenue: Number(summarySales?.revenue ?? rawMetrics.revenue),
    grossSales: Number(summarySales?.gross_sales ?? rawMetrics.grossSales),
    tax: Number(summarySales?.tax ?? rawMetrics.tax),
    discount: Number(summarySales?.discount ?? rawMetrics.discount),
    cogs: Number(summarySales?.cogs ?? rawMetrics.cogs),
    orders: Number(summarySales?.count ?? rawMetrics.orders),
    aov:
      Number(summarySales?.count ?? rawMetrics.orders) > 0
        ? Number(summarySales?.revenue ?? rawMetrics.revenue) /
          Number(summarySales?.count ?? rawMetrics.orders)
        : 0,
  };
  const revenue = m.revenue;
  const cogs = m.cogs;
  const expenseTotal = Number(summaryExpenses?.total ?? sum(data.expenses, "amount"));
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseTotal;
  const inventoryValue = inventoryValueOf(data.products);
  const turnover = inventoryValue > 0 ? cogs / inventoryValue : 0;
  const inStock = data.products.filter((p) => Number(p.stock) > 0).length;
  const outOfStock = data.products.filter((p) => Number(p.stock) <= 0).length;
  const productsWithVariants = new Set(data.variants.map((variant) => variant.product_id));
  const negativeStock =
    data.products.filter(
      (product) => !productsWithVariants.has(product.id) && Number(product.stock) < 0,
    ).length + data.variants.filter((variant) => Number(variant.stock) < 0).length;
  const aov = m.aov;
  const payingCustomers = Number(
    summarySales?.customer_count ??
      new Set(
        data.sales
          .filter((s) => s.customer_id && Number(s.total ?? 0) > 0)
          .map((s) => s.customer_id),
      ).size,
  );
  const clv = payingCustomers ? revenue / payingCustomers : 0;
  const cashIn = sum(
    data.cash.filter((c) => c.type === "in"),
    "amount",
  );
  const cashOut = sum(
    data.cash.filter((c) => c.type === "out"),
    "amount",
  );
  const receivables = sum(data.ar, "amount") - sum(data.ar, "paid");
  const payables = sum(data.ap, "amount") - sum(data.ap, "paid");
  // Current assets = cash + receivables + inventory; current liabilities = payables.
  const currentAssets = inventoryValue + receivables + (cashIn - cashOut);
  const currentRatio = payables > 0 ? currentAssets / payables : null;
  const invested = expenseTotal + cogs;
  const roi = invested > 0 ? (netProfit / invested) * 100 : 0;
  const makeSummarySale = (summaryRow: Row, id: string, saleDate: string) => ({
    id,
    status: "completed",
    sale_date: saleDate,
    total: Number(summaryRow.revenue ?? 0) + Number(summaryRow.tax ?? 0),
    tax: Number(summaryRow.tax ?? 0),
    shipping: 0,
    other_charges: 0,
    cost_total: Number(summaryRow.cogs ?? 0),
  });
  const healthSalesForScoring =
    aggregateRange && summarySales
      ? [
          makeSummarySale(
            summarySales,
            `aggregate-${range.fromDate}-${range.toDate}`,
            range.toDate,
          ),
          ...(range.previousToDate && data.previousSummary
            ? [
                makeSummarySale(
                  data.previousSummary.sales as Row,
                  `aggregate-${range.previousFromDate}-${range.previousToDate}`,
                  range.previousToDate,
                ),
              ]
            : []),
        ]
      : [...data.previousSales, ...data.sales];
  const healthExpenses =
    aggregateRange && summaryExpenses
      ? Number(summaryExpenses.count ?? 0) > 0
        ? [{ expense_date: range.toDate, amount: Number(summaryExpenses.total ?? 0) }]
        : []
      : data.expenses;
  const health = healthScoreFromRecords({
    businessType: business?.type,
    sales: [...new Map([...healthSalesForScoring, ...data.healthSales].map((sale) => [sale.id, sale])).values()],
    periodSales: healthSalesForScoring,
    cashFlowSales: data.healthSales,
    expenses: healthExpenses,
    cashTransactions: data.cash,
    receivables: data.ar,
    payables: data.ap,
    products: data.products,
    variants: data.variants,
    saleItems: data.saleItems,
    inventoryMovements: data.movements,
    batches: data.batches,
    salesHistoryExists: data.salesHistory.length > 0,
    range: {
      fromDate: range.fromDate,
      toDate: range.toDate,
      previousFromDate: range.previousFromDate,
      previousToDate: range.previousToDate,
      hasPreviousPeriod: Boolean(range.previousFromDate && range.previousToDate),
      timezone,
    },
  });

  const kpis = [
    { label: `Revenue (${range.label})`, value: formatCurrency(revenue, currency) },
    { label: `Gross Profit (${range.label})`, value: formatCurrency(grossProfit, currency) },
    { label: `Net Profit (${range.label})`, value: formatCurrency(netProfit, currency) },
    { label: `Gross Margin (${range.label})`, value: formatPercent(marginPercent(grossProfit, revenue)) },
    { label: `Net Profit Margin (${range.label})`, value: formatPercent(marginPercent(netProfit, revenue)) },
    { label: `Expense Ratio (${range.label})`, value: formatPercent(revenue ? (expenseTotal / revenue) * 100 : 0) },
    { label: "Inventory Turnover (as of today)", value: `${turnover.toFixed(2)}x` },
    { label: `Tax Collected (${range.label})`, value: formatCurrency(m.tax, currency) },
    { label: "Products In Stock (as of today)", value: formatNumber(inStock) },
    { label: "Out Of Stock (as of today)", value: formatNumber(outOfStock) },
    { label: `Average Order Value (${range.label})`, value: formatCurrency(aov, currency) },
    { label: `Customer Lifetime Value (${range.label})`, value: formatCurrency(clv, currency) },
    { label: "Cash Flow Ratio (as of today)", value: cashOut ? (cashIn / cashOut).toFixed(2) : "—" },
    { label: "Current Ratio (as of today)", value: currentRatio === null ? "—" : currentRatio.toFixed(2) },
    { label: `ROI (${range.label})`, value: formatPercent(roi) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Analytics"
        description="Recalculated from posted sales only — quotes, drafts and voided documents are excluded, and returns are subtracted."
        actions={
          <DateRangePicker
            selection={selection}
            range={range}
            timezone={timezone}
            onChange={setSelection}
          />
        }
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
      <BusinessHealthCard health={health} periodLabel={range.label} />
    </div>
  );
}
