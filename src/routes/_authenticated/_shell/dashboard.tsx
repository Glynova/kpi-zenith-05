import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { formatCurrency, formatNumber, formatDate, daysAgoISO, todayISO } from "@/lib/format";
import {
  salesMetrics,
  saleNetRevenue,
  inventoryValueOf,
  healthScore,
  marginPercent,
} from "@/lib/kpi";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiOrb } from "@/components/kpi-orb";
import { StatCard } from "@/components/stat-card";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

/** Percent change vs. the previous period; null when there is no baseline. */
function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function Dashboard() {
  const { businessId, currency } = useBusiness();
  const [range, setRange] = useState("30");
  const days = Number(range);
  const from = daysAgoISO(days);
  // Same-length window immediately before the selected one, used purely for
  // period-over-period comparison. Business calculations are unchanged.
  const prevFrom = daysAgoISO(days * 2);
  const today = todayISO();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard", businessId, range],
    enabled: !!businessId,
    queryFn: async () => {
      const [sales, expenses, products, ar, ap, cash, saleItems, customers, logs] =
        await Promise.all([
          db.from("sales").select("*").eq("business_id", businessId).gte("sale_date", prevFrom),
          db
            .from("expenses")
            .select("*")
            .eq("business_id", businessId)
            .gte("expense_date", prevFrom),

          db.from("products").select("*").eq("business_id", businessId),
          db.from("accounts_receivable").select("*").eq("business_id", businessId),
          db.from("accounts_payable").select("*").eq("business_id", businessId),
          db.from("cash_transactions").select("*").eq("business_id", businessId),
          db.from("sale_items").select("*").eq("business_id", businessId).limit(1000),
          db.from("customers").select("*").eq("business_id", businessId),
          db
            .from("audit_logs")
            .select("*")
            .eq("business_id", businessId)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
      return {
        sales: (sales.data ?? []) as Row[],
        expenses: (expenses.data ?? []) as Row[],
        products: (products.data ?? []) as Row[],
        ar: (ar.data ?? []) as Row[],
        ap: (ap.data ?? []) as Row[],
        cash: (cash.data ?? []) as Row[],
        saleItems: (saleItems.data ?? []) as Row[],
        customers: (customers.data ?? []) as Row[],
        logs: (logs.data ?? []) as Row[],
      };
    },
  });

  const m = useMemo(() => {
    const d = data;
    if (!d) return null;
    const sum = (rows: Row[], key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

    // The query fetches two windows; everything below the split uses the
    // current window only, so no existing calculation changes.
    const curSales = d.sales.filter((s) => String(s.sale_date) >= from);
    const prevSales = d.sales.filter((s) => String(s.sale_date) < from);
    const curExpenses = d.expenses.filter((e) => String(e.expense_date) >= from);
    const prevExpenses = d.expenses.filter((e) => String(e.expense_date) < from);

    const todayRows = curSales.filter((s) => s.sale_date === today);
    const todayExpenses = curExpenses.filter((e) => e.expense_date === today);
    const period = salesMetrics(curSales);
    const prevPeriod = salesMetrics(prevSales);
    const todayM = salesMetrics(todayRows);

    const revenue = period.revenue;
    const expenseTotal = sum(curExpenses, "amount");
    const prevExpenseTotal = sum(prevExpenses, "amount");
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
    const receivables = d.ar.reduce((a, r) => a + (Number(r.amount) - Number(r.paid)), 0);
    const payables = d.ap.reduce((a, r) => a + (Number(r.amount) - Number(r.paid)), 0);

    // time series
    const byDay = new Map<string, { date: string; sales: number; expenses: number }>();
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
    const series = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

    // best sellers
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of d.saleItems) {
      const k = it.product_name ?? it.product_id ?? "Unknown";
      const e = byProduct.get(k) ?? { name: k, qty: 0, revenue: 0 };
      e.qty += Number(it.quantity ?? 0);
      e.revenue += Number(it.total ?? 0);
      byProduct.set(k, e);
    }
    const bestSellers = Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // expense mix
    const byCat = new Map<string, number>();
    for (const x of curExpenses) {
      byCat.set(
        x.category ?? "other",
        (byCat.get(x.category ?? "other") ?? 0) + Number(x.amount ?? 0),
      );
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
    const topCustomers = Array.from(byCustomer.entries())
      .map(([id, total]) => ({
        name: d.customers.find((c) => c.id === id)?.name ?? "Unknown",
        total,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const margin = marginPercent(netProfit, revenue);
    const expenseRatio = revenue > 0 ? (expenseTotal / revenue) * 100 : 0;
    const aov = period.aov;

    const health = healthScore({
      netMargin: margin,
      revenue,
      netCashFlow: cashIn - cashOut,
      outOfStock: outOfStock.length,
      productCount: d.products.length,
      receivables,
      payables,
    });

    const revenueTrend = series.map((p) => p.sales);
    const expenseTrend = series.map((p) => p.expenses);
    const profitTrend = series.map((p) => p.sales - p.expenses);

    return {
      todaySales: todayM.revenue,
      todayExpenses: sum(todayExpenses, "amount"),
      todayProfit: todayM.grossProfit - sum(todayExpenses, "amount"),
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
      series,
      revenueTrend,
      expenseTrend,
      profitTrend,
      revenueDelta: pctChange(revenue, prevPeriod.revenue),
      profitDelta: pctChange(netProfit, prevNetProfit),
      expenseDelta: pctChange(expenseTotal, prevExpenseTotal),
      ordersDelta: pctChange(curSales.length, prevSales.length),
      orders: curSales.length,
      bestSellers,
      expenseMix,
      topCustomers,
      margin,
      expenseRatio,
      aov,
      health,
      logs: d.logs,
    };
  }, [data, today, from]);

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

  if (isLoading || !m) {
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
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {!hasActivity && (
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
          />
          <StatCard
            label="Net Profit (period)"
            value={formatCurrency(m.netProfit, currency)}
            sub={`${m.margin.toFixed(1)}% margin`}
            icon={Activity}
            tone={m.netProfit >= 0 ? "success" : "destructive"}
            delta={m.profitDelta}
            series={m.profitTrend}
          />
          <StatCard
            label="Cash On Hand"
            value={formatCurrency(m.cashOnHand, currency)}
            icon={Wallet}
            tone="gold"
            sub={`${formatNumber(m.orders)} orders this period`}
          />
          <StatCard
            label="Inventory Value"
            value={formatCurrency(m.inventoryValue, currency)}
            icon={Boxes}
            sub={`${formatNumber(m.lowStock.length)} low · ${formatNumber(m.outOfStock.length)} out`}
          />
        </div>
        <Card className="surface-card overflow-hidden border-0">
          <CardContent className="p-2">
            <KpiOrb score={m.health} caption={`Expense ratio ${m.expenseRatio.toFixed(1)}%`} />
          </CardContent>
        </Card>
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
              label="Today's Sales"
              value={formatCurrency(m.todaySales, currency)}
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              label="Today's Expenses"
              value={formatCurrency(m.todayExpenses, currency)}
              icon={TrendingDown}
              tone="warning"
            />
            <StatCard
              label="Today's Profit"
              value={formatCurrency(m.todayProfit, currency)}
              icon={Activity}
            />
            <StatCard
              label="Expenses (period)"
              value={formatCurrency(m.expenseTotal, currency)}
              icon={TrendingDown}
              tone="warning"
              delta={m.expenseDelta}
              invertDelta
              series={m.expenseTrend}
            />
            <StatCard
              label="Orders (period)"
              value={formatNumber(m.orders)}
              icon={Activity}
              delta={m.ordersDelta}
            />
            <StatCard
              label="Outstanding Receivables"
              value={formatCurrency(m.receivables, currency)}
              icon={ArrowDownLeft}
              tone="warning"
            />
            <StatCard
              label="Outstanding Payables"
              value={formatCurrency(m.payables, currency)}
              icon={ArrowUpRight}
              tone="warning"
            />
            <StatCard
              label="Low Stock Items"
              value={formatNumber(m.lowStock.length)}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Out Of Stock"
              value={formatNumber(m.outOfStock.length)}
              icon={PackageX}
              tone="destructive"
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
            {m.series.length === 0 ? (
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
            {m.expenseMix.length === 0 ? (
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
            {m.bestSellers.length === 0 ? (
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
            {m.topCustomers.length === 0 ? (
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
            {m.logs.length === 0 ? (
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
