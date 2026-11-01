import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Wallet,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  PackageX,
  Activity,
} from "lucide-react";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";
import {
  addCalendarDays,
  buildDateBuckets,
  dateInTimeZone,
  useBusinessDateRange,
} from "@/lib/date-range";
import {
  salesMetrics,
  saleNetRevenue,
  isPostedSale,
  inventoryValueOf,
  healthScoreFromRecords,
  marginPercent,
} from "@/lib/kpi";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessHealthCard } from "@/components/business-health-card";
import { DateRangePicker } from "@/components/date-range-picker";
import { StatCard } from "@/components/stat-card";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Daraven ERP" },
      {
        name: "description",
        content:
          "View your real-time business performance, inventory levels and financial KPIs in one unified dashboard.",
      },
      { property: "og:title", content: "Dashboard — Daraven ERP" },
      {
        property: "og:description",
        content:
          "View your real-time business performance, inventory levels and financial KPIs in one unified dashboard.",
      },
      { property: "og:url", content: "https://daraven.com/dashboard" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/dashboard" }],
  }),
  component: Dashboard,
});

/** Percent change vs. the previous period; null when there is no baseline. */
function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Dashboard() {
  const { businessId, currency, role, business } = useBusiness();
  const timezone = String(business?.timezone ?? "Asia/Manila");
  const { selection, range, setSelection, isResolvingAllTime, rangeError } = useBusinessDateRange(
    businessId,
    timezone,
  );
  const today = dateInTimeZone(new Date(), timezone);
  const inventoryFrom = addCalendarDays(today, -180);
  const healthSalesFrom = addCalendarDays(today, -90);
  const previousOrCurrentFrom = range.previousFromDate ?? range.fromDate;
  const aggregateRange = range.bucket === "month" || range.preset === "all";

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard", businessId, range.from, range.to, range.previousFrom],
    enabled: !!businessId && !isResolvingAllTime && !rangeError,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const loadRows = async (
        name: string,
        query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
      ) => {
        try {
          const result = await query;
          if (result.error) {
            console.error(`[Dashboard] Failed to load ${name}`, result.error);
            return { rows: [] as Row[], error: result.error.message };
          }
          return { rows: (result.data ?? []) as Row[], error: null as string | null };
        } catch (loadError) {
          console.error(`[Dashboard] Failed to load ${name}`, loadError);
          return {
            rows: [] as Row[],
            error: loadError instanceof Error ? loadError.message : String(loadError),
          };
        }
      };
      const loadAggregate = async (name: string, from: string, to: string) => {
        try {
          const result = await db.rpc("get_business_period_aggregate", {
            _business_id: businessId,
            _from: from,
            _to: to,
            _timezone: timezone,
            _bucket: range.bucket,
          });
          if (result.error) {
            console.error(`[Dashboard] Failed to load ${name}`, result.error);
            return { value: null as Row | null, error: result.error.message as string | null };
          }
          return { value: (result.data ?? null) as Row | null, error: null as string | null };
        } catch (loadError) {
          console.error(`[Dashboard] Failed to load ${name}`, loadError);
          return {
            value: null as Row | null,
            error: loadError instanceof Error ? loadError.message : String(loadError),
          };
        }
      };
      const [
        sales,
        expenses,
        products,
        variants,
        ar,
        ap,
        cash,
        saleItems,
        healthSaleItems,
        healthSales,
        salesHistory,
        movements,
        batches,
        customers,
        logs,
        summary,
        previousSummary,
      ] = await Promise.all([
        loadRows(
          "sales",
          aggregateRange
            ? db.from("sales").select("id").eq("business_id", businessId).limit(0)
            : db
            .from("sales")
            .select("*")
            .eq("business_id", businessId)
            .gte("sale_date", previousOrCurrentFrom)
            .lte("sale_date", range.toDate)
            .limit(5000),
        ),
        loadRows(
          "expenses",
          aggregateRange
            ? db.from("expenses").select("id").eq("business_id", businessId).limit(0)
            : db
            .from("expenses")
            .select("*")
            .eq("business_id", businessId)
            .gte("expense_date", previousOrCurrentFrom)
            .lte("expense_date", range.toDate)
            .limit(5000),
        ),
        loadRows("products", db.from("products").select("*").eq("business_id", businessId)),
        loadRows(
          "product variants",
          db
            .from("product_variants")
            .select("id,product_id,stock,cost_price,status,created_at")
            .eq("business_id", businessId),
        ),
        loadRows(
          "receivables",
          db.from("accounts_receivable").select("*").eq("business_id", businessId),
        ),
        loadRows("payables", db.from("accounts_payable").select("*").eq("business_id", businessId)),
        loadRows(
          "cash transactions",
          db.from("cash_transactions").select("*").eq("business_id", businessId),
        ),
        loadRows(
          "sale items",
          aggregateRange
            ? db.from("sale_items").select("id").eq("business_id", businessId).limit(0)
            : db
                .from("sale_items")
                .select("*,sales!inner(sale_date)")
                .eq("business_id", businessId)
                .gte("sales.sale_date", range.fromDate)
                .lte("sales.sale_date", range.toDate)
                .limit(5000),
        ),
        loadRows(
          "health score sale items",
          db
            .from("sale_items")
            .select("*,sales!inner(sale_date)")
            .eq("business_id", businessId)
            .gte("sales.sale_date", healthSalesFrom)
            .lte("sales.sale_date", today)
            .limit(10000),
        ),
        loadRows(
          "health score recent sales",
          db
            .from("sales")
            .select("*")
            .eq("business_id", businessId)
            .gte("sale_date", healthSalesFrom)
            .lte("sale_date", today),
        ),
        loadRows(
          "sales history",
          db.from("sales").select("id").eq("business_id", businessId).limit(1),
        ),
        loadRows(
          "inventory movements",
          db
            .from("inventory_movements")
            .select("product_id,variant_id,type,movement_date,created_at")
            .eq("business_id", businessId)
            .gte("movement_date", inventoryFrom),
        ),
        loadRows(
          "batches",
          db
            .from("batches")
            .select("product_id,variant_id,remaining_quantity,unit_cost,expiry_date")
            .eq("business_id", businessId),
        ),
        loadRows("customers", db.from("customers").select("*").eq("business_id", businessId)),
        loadRows(
          "audit activity",
          db
            .from("audit_logs")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", { ascending: false })
            .limit(8),
        ),
        loadAggregate("selected-period aggregates", range.from, range.to),
        range.previousFrom && range.previousTo
          ? loadAggregate("previous-period aggregates", range.previousFrom, range.previousTo)
          : Promise.resolve({ value: null as Row | null, error: null as string | null }),
      ]);
      return {
        sales: sales.rows,
        expenses: expenses.rows,
        products: products.rows,
        variants: variants.rows,
        ar: ar.rows,
        ap: ap.rows,
        cash: cash.rows,
        saleItems: saleItems.rows,
        healthSaleItems: healthSaleItems.rows,
        healthSales: healthSales.rows,
        salesHistory: salesHistory.rows,
        movements: movements.rows,
        batches: batches.rows,
        customers: customers.rows,
        logs: logs.rows,
        summary: summary.value,
        previousSummary: previousSummary.value,
        errors: {
          sales: sales.error,
          expenses: expenses.error,
          products: products.error,
          variants: variants.error,
          receivables: ar.error,
          payables: ap.error,
          cash: cash.error,
          saleItems: saleItems.error,
          healthSaleItems: healthSaleItems.error,
          healthSales: healthSales.error,
          salesHistory: salesHistory.error,
          movements: movements.error,
          batches: batches.error,
          customers: customers.error,
          logs: logs.error,
          summary: summary.error,
          previousSummary: previousSummary.error,
        },
      };
    },
  });

  const m = useMemo(() => {
    const d = data;
    if (!d) return null;
    const sum = (rows: Row[], key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

    // The query fetches two windows; everything below the split uses the
    // current window only, so no existing calculation changes.
    const curSales = d.sales.filter(
      (s) =>
        String(s.sale_date) >= range.fromDate &&
        String(s.sale_date) <= range.toDate &&
        isPostedSale(s),
    );
    const prevSales = d.sales.filter(
      (s) =>
        range.previousFromDate &&
        range.previousToDate &&
        String(s.sale_date) >= range.previousFromDate &&
        String(s.sale_date) <= range.previousToDate &&
        isPostedSale(s),
    );
    const curExpenses = d.expenses.filter(
      (e) => String(e.expense_date) >= range.fromDate && String(e.expense_date) <= range.toDate,
    );
    const prevExpenses = d.expenses.filter(
      (e) =>
        range.previousFromDate &&
        range.previousToDate &&
        String(e.expense_date) >= range.previousFromDate &&
        String(e.expense_date) <= range.previousToDate,
    );

    const periodRaw = salesMetrics(curSales);
    const previousRaw = salesMetrics(prevSales);
    const summarySales = d.summary?.sales as Row | undefined;
    const summaryExpenses = d.summary?.expenses as Row | undefined;
    const previousSummarySales = d.previousSummary?.sales as Row | undefined;
    const previousSummaryExpenses = d.previousSummary?.expenses as Row | undefined;
    const period = {
      ...periodRaw,
      revenue: Number(summarySales?.revenue ?? periodRaw.revenue),
      grossSales: Number(summarySales?.gross_sales ?? periodRaw.grossSales),
      tax: Number(summarySales?.tax ?? periodRaw.tax),
      discount: Number(summarySales?.discount ?? periodRaw.discount),
      cogs: Number(summarySales?.cogs ?? periodRaw.cogs),
      grossProfit:
        Number(summarySales?.revenue ?? periodRaw.revenue) -
        Number(summarySales?.cogs ?? periodRaw.cogs),
      orders: Number(summarySales?.count ?? periodRaw.orders),
      aov:
        Number(summarySales?.count ?? periodRaw.orders) > 0
          ? Number(summarySales?.revenue ?? periodRaw.revenue) /
            Number(summarySales?.count ?? periodRaw.orders)
          : 0,
    };
    const prevPeriod = {
      ...previousRaw,
      revenue: Number(previousSummarySales?.revenue ?? previousRaw.revenue),
      cogs: Number(previousSummarySales?.cogs ?? previousRaw.cogs),
      grossProfit:
        Number(previousSummarySales?.revenue ?? previousRaw.revenue) -
        Number(previousSummarySales?.cogs ?? previousRaw.cogs),
      orders: Number(previousSummarySales?.count ?? previousRaw.orders),
    };
    const revenue = period.revenue;
    const expenseTotal = Number(summaryExpenses?.total ?? sum(curExpenses, "amount"));
    const prevExpenseTotal = Number(
      previousSummaryExpenses?.total ?? sum(prevExpenses, "amount"),
    );
    const grossProfit = period.grossProfit;
    const netProfit = grossProfit - expenseTotal;
    const prevNetProfit = prevPeriod.grossProfit - prevExpenseTotal;

    const cashIn = sum(
      d.cash.filter((c) => c.type === "in"),
      "amount",
    );
    const cashOut = sum(
      d.cash.filter((c) => c.type === "out"),
      "amount",
    );
    const inventoryValue = inventoryValueOf(d.products);
    const lowStock = d.products.filter(
      (p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.reorder_level ?? 0),
    );
    const outOfStock = d.products.filter((p) => Number(p.stock) <= 0);
    const productsWithVariants = new Set(d.variants.map((v) => v.product_id));
    const negativeStock = [
      ...d.products.filter((p) => !productsWithVariants.has(p.id) && Number(p.stock) < 0),
      ...d.variants.filter((variant) => Number(variant.stock) < 0),
    ];
    const receivables = d.ar.reduce((a, r) => a + (Number(r.amount) - Number(r.paid)), 0);
    const payables = d.ap.reduce((a, r) => a + (Number(r.amount) - Number(r.paid)), 0);

    // Fill missing buckets so the chart axis stays evenly spaced.
    const byDay = new Map<string, { date: string; sales: number; expenses: number }>();
    for (const point of (d.summary?.series ?? []) as Row[]) {
      byDay.set(String(point.date), {
        date: String(point.date),
        sales: Number(point.sales ?? 0),
        expenses: Number(point.expenses ?? 0),
      });
    }
    if (!d.summary) {
      for (const s of curSales) {
        const net = saleNetRevenue(s);
        if (!net) continue;
        const k = s.sale_date;
        const e = byDay.get(k) ?? { date: k, sales: 0, expenses: 0 };
        e.sales += net;
        byDay.set(k, e);
      }
      for (const x of curExpenses) {
        const k = x.expense_date;
        const e = byDay.get(k) ?? { date: k, sales: 0, expenses: 0 };
        e.expenses += Number(x.amount ?? 0);
        byDay.set(k, e);
      }
    }
    const series = buildDateBuckets(range.fromDate, range.toDate, range.bucket).map((bucket) => {
      const bucketStart = bucket.key;
      const matched = Array.from(byDay.values()).filter((point) => {
        if (range.bucket === "day") return point.date === bucketStart;
        if (range.bucket === "week") {
          return point.date >= bucketStart && point.date < addCalendarDays(bucketStart, 7);
        }
        return point.date.slice(0, 7) === bucketStart.slice(0, 7);
      });
      return {
        date: bucket.label,
        sales: matched.reduce((total, point) => total + point.sales, 0),
        expenses: matched.reduce((total, point) => total + point.expenses, 0),
      };
    });

    // best sellers
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    if (aggregateRange && d.summary) {
      for (const item of (d.summary.top_items ?? []) as Row[]) {
        byProduct.set(String(item.item), {
          name: String(item.item),
          qty: Number(item.quantity ?? 0),
          revenue: Number(item.revenue ?? 0),
        });
      }
    }
    for (const it of d.saleItems) {
      const k = it.product_name ?? it.product_id ?? "Unknown";
      const e = byProduct.get(k) ?? { name: k, qty: 0, revenue: 0 };
      e.qty += Number(it.quantity ?? 0);
      e.revenue += Number(it.total ?? 0);
      byProduct.set(k, e);
    }
    const bestSellers = (aggregateRange && d.summary
      ? Array.from(byProduct.values())
      : Array.from(byProduct.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5));

    // expense mix
    const byCat = new Map<string, number>();
    if (aggregateRange && d.summary) {
      for (const category of (d.summary.expense_categories ?? []) as Row[]) {
        byCat.set(String(category.category), Number(category.amount ?? 0));
      }
    } else {
      for (const x of curExpenses) {
        byCat.set(
          x.category ?? "other",
          (byCat.get(x.category ?? "other") ?? 0) + Number(x.amount ?? 0),
        );
      }
    }
    const expenseMix = Array.from(byCat.entries()).map(([name, value]) => ({ name, value }));

    // top customers
    const byCustomer = new Map<string, number>();
    for (const s of curSales) {
      if (!s.customer_id) continue;
      const net = saleNetRevenue(s);
      if (!net) continue;
      byCustomer.set(s.customer_id, (byCustomer.get(s.customer_id) ?? 0) + net);
    }
    const topCustomers = (aggregateRange && d.summary
      ? ((d.summary.top_customers ?? []) as Row[]).map((customer) => ({
          name: String(customer.name ?? "Unknown"),
          total: Number(customer.amount ?? 0),
        }))
      : Array.from(byCustomer.entries())
      .map(([id, total]) => ({
        name: d.customers.find((c) => c.id === id)?.name ?? "Unknown",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5));

    const margin = marginPercent(netProfit, revenue);
    const expenseRatio = revenue > 0 ? (expenseTotal / revenue) * 100 : 0;
    const aov = period.aov;
    const makeSummarySale = (summary: Row, id: string, saleDate: string) => ({
    id,
    status: "completed",
    sale_date: saleDate,
    total: Number(summary.revenue ?? 0) + Number(summary.tax ?? 0),
    tax: Number(summary.tax ?? 0),
    shipping: 0,
    other_charges: 0,
    cost_total: Number(summary.cogs ?? 0),
    });
    const healthPeriodSales =
    aggregateRange && summarySales
      ? [
          makeSummarySale(
            summarySales,
            `aggregate-${range.fromDate}-${range.toDate}`,
            range.toDate,
          ),
          ...(range.previousToDate && previousSummarySales
            ? [
                makeSummarySale(
                  previousSummarySales,
                  `aggregate-${range.previousFromDate}-${range.previousToDate}`,
                  range.previousToDate,
                ),
              ]
            : []),
        ]
      : d.sales;
    const healthPeriodExpenses =
    aggregateRange && summaryExpenses
      ? Number(summaryExpenses.count ?? 0) > 0
        ? [{ expense_date: range.toDate, amount: Number(summaryExpenses.total ?? 0) }]
        : []
      : d.expenses;

    const health = healthScoreFromRecords({
    businessType: business?.type,
    sales: [
      ...new Map(
        [...healthPeriodSales, ...d.healthSales].map((sale) => [sale.id, sale]),
      ).values(),
    ],
    periodSales: healthPeriodSales,
    cashFlowSales: d.healthSales,
    expenses: healthPeriodExpenses,
      cashTransactions: d.cash,
      receivables: d.ar,
      payables: d.ap,
      products: d.products,
      variants: d.variants,
      saleItems: d.healthSaleItems,
      inventoryMovements: d.movements,
      batches: d.batches,
      salesHistoryExists: d.salesHistory.length > 0,
      range: {
        fromDate: range.fromDate,
        toDate: range.toDate,
        previousFromDate: range.previousFromDate,
        previousToDate: range.previousToDate,
        hasPreviousPeriod: Boolean(range.previousFromDate && range.previousToDate),
        timezone,
      },
    });
    const healthError = [
      "sales",
      "expenses",
      "cash",
      "receivables",
      "payables",
      "products",
      "variants",
      "healthSaleItems",
      "healthSales",
      "salesHistory",
      ...(aggregateRange ? ["summary"] : []),
      "movements",
      "batches",
    ].some((key) => d.errors[key as keyof typeof d.errors]);

    const revenueTrend = series.map((p) => p.sales);
    const expenseTrend = series.map((p) => p.expenses);
    const profitTrend = series.map((p) => p.sales - p.expenses);

    return {
      revenue,
      netProfit,
      grossProfit,
      expenseTotal,
      cashOnHand: cashIn - cashOut,
      inventoryValue,
      receivables,
      payables,
      lowStock,
      outOfStock,
      negativeStock,
      series,
      revenueTrend,
      expenseTrend,
      profitTrend,
      revenueDelta: pctChange(revenue, prevPeriod.revenue),
      profitDelta: pctChange(netProfit, prevNetProfit),
      expenseDelta: pctChange(expenseTotal, prevExpenseTotal),
      ordersDelta: range.previousFromDate
        ? pctChange(period.orders, prevPeriod.orders)
        : null,
      orders: period.orders,
      bestSellers,
      expenseMix,
      topCustomers,
      margin,
      expenseRatio,
      aov,
      health,
      healthError,
      errors: d.errors,
      logs: d.logs,
      periodLabel: range.label,
    };
  }, [business?.type, data, today, range, timezone]);

  if (rangeError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Could not resolve the selected date range." />
        <p className="text-sm text-destructive" role="status">{rangeError.message}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="We couldn't load your business data." />
        <Card className="surface-card border-0">
          <CardContent className="space-y-3 p-8 text-center">
            <AlertTriangle className="mx-auto size-8 text-warning" />
            <p className="text-sm text-muted-foreground">
              {(error as Error)?.message ?? "Something went wrong while loading your dashboard."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || isResolvingAllTime || !m) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Loading your business performance..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const hasActivity =
    m.orders > 0 ||
    m.expenseTotal !== 0 ||
    m.inventoryValue !== 0 ||
    m.cashOnHand !== 0 ||
    m.receivables !== 0 ||
    m.payables !== 0;

  const chartColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Smarter decisions start with the numbers that matter."
        actions={
          <DateRangePicker
            selection={selection}
            range={range}
            timezone={timezone}
            onChange={setSelection}
          />
        }
      />

      {(role === "owner" || role === "admin") && m.negativeStock.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <PackageX className="size-5 text-destructive" />
              <p className="text-sm font-semibold text-destructive">
                {m.negativeStock.length} items have negative stock
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/inventory">View inventory</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasActivity && !Object.values(m.errors).some(Boolean) && (
        <Card className="surface-card border-0">
          <CardContent className="space-y-2 p-8 text-center">
            <Activity className="mx-auto size-8 text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">No data yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Once you record sales, expenses or stock for this period, your live performance
              figures will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="stagger-grid grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Revenue (period)"
            value={formatCurrency(m.revenue, currency)}
            sub={`Avg order ${formatCurrency(m.aov, currency)}`}
            icon={TrendingUp}
            delta={m.revenueDelta}
            series={m.revenueTrend}
            error={!!(m.errors.sales || (aggregateRange && m.errors.summary))}
          />
          <StatCard
            label="Net Profit (period)"
            value={formatCurrency(m.netProfit, currency)}
            sub={`${m.margin.toFixed(1)}% margin`}
            icon={Activity}
            tone={m.netProfit >= 0 ? "success" : "destructive"}
            delta={m.profitDelta}
            series={m.profitTrend}
            error={!!(m.errors.sales || m.errors.expenses)}
          />
          <StatCard
            label="Cash On Hand"
            value={formatCurrency(m.cashOnHand, currency)}
            icon={Wallet}
            tone="gold"
            sub="As of today"
            error={!!m.errors.cash}
          />
          <StatCard
            label="Inventory Value (as of today)"
            value={formatCurrency(m.inventoryValue, currency)}
            icon={Boxes}
            sub={`${formatNumber(m.lowStock.length)} low · ${formatNumber(m.outOfStock.length)} out`}
            error={!!m.errors.products}
          />
        </div>
        <BusinessHealthCard
          health={m.health}
          error={m.healthError}
          periodLabel={m.periodLabel}
        />
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="group gap-2">
            Show all metrics
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="stagger-grid mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`Revenue (${range.label})`}
              value={formatCurrency(m.revenue, currency)}
              icon={TrendingUp}
              tone="success"
              error={!!m.errors.sales}
            />
            <StatCard
              label={`Expenses (${range.label})`}
              value={formatCurrency(m.expenseTotal, currency)}
              icon={TrendingDown}
              tone="warning"
              error={!!(m.errors.expenses || (aggregateRange && m.errors.summary))}
            />
            <StatCard
              label={`Net Profit (${range.label})`}
              value={formatCurrency(m.netProfit, currency)}
              icon={Activity}
              error={
                !!(
                  m.errors.sales ||
                  m.errors.expenses ||
                  (aggregateRange && m.errors.summary)
                )
              }
            />
            <StatCard
              label={`Expenses (${range.label})`}
              value={formatCurrency(m.expenseTotal, currency)}
              icon={TrendingDown}
              tone="warning"
              delta={m.expenseDelta}
              invertDelta
              series={m.expenseTrend}
              error={!!(m.errors.expenses || (aggregateRange && m.errors.summary))}
            />
            <StatCard
              label={`Orders (${range.label})`}
              value={formatNumber(m.orders)}
              icon={Activity}
              delta={m.ordersDelta}
              error={!!(m.errors.sales || (aggregateRange && m.errors.summary))}
            />
            <StatCard
              label="Receivables (as of today)"
              value={formatCurrency(m.receivables, currency)}
              icon={ArrowDownLeft}
              tone="warning"
              error={!!m.errors.receivables}
            />
            <StatCard
              label="Payables (as of today)"
              value={formatCurrency(m.payables, currency)}
              icon={ArrowUpRight}
              tone="warning"
              error={!!m.errors.payables}
            />
            <StatCard
              label="Low Stock Items"
              value={formatNumber(m.lowStock.length)}
              icon={AlertTriangle}
              tone="warning"
              error={!!m.errors.products}
            />
            <StatCard
              label="Out Of Stock"
              value={formatNumber(m.outOfStock.length)}
              icon={PackageX}
              tone="destructive"
              error={!!m.errors.products}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="surface-card border-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sales vs Expenses</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {m.errors.sales ||
            m.errors.expenses ||
            (aggregateRange && m.errors.summary) ? (
              <p className="text-sm text-destructive" role="status">
                Could not load
              </p>
            ) : !m.hasSeriesData ? (
              <p className="text-sm text-muted-foreground">No transactions in this period yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={m.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    stroke="hsl(var(--chart-5))"
                    fill="hsl(var(--chart-5))"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="surface-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Expense Mix</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {m.errors.expenses || (aggregateRange && m.errors.summary) ? (
              <p className="text-sm text-destructive" role="status">
                Could not load
              </p>
            ) : m.expenseMix.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expenses recorded.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={m.expenseMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                  >
                    {m.expenseMix.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="surface-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Best Selling Products</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {m.errors.saleItems || (aggregateRange && m.errors.summary) ? (
              <p className="text-sm text-destructive" role="status">
                Could not load
              </p>
            ) : m.bestSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales recorded.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.bestSellers}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="surface-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Top Customers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.errors.sales ||
            m.errors.customers ||
            (aggregateRange && m.errors.summary) ? (
              <p className="text-sm text-destructive" role="status">
                Could not load
              </p>
            ) : m.topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customer sales yet.</p>
            ) : (
              m.topCustomers.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 font-medium">{formatCurrency(c.total, currency)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="surface-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.errors.logs ? (
              <p className="text-sm text-destructive" role="status">
                Could not load
              </p>
            ) : m.logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logged yet.</p>
            ) : (
              m.logs.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{l.action}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(l.created_at)}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {l.module}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
