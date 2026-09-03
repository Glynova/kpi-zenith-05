/* eslint-disable @typescript-eslint/no-explicit-any */
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
      { title: "Dashboard — KPIOptiva" },
      { name: "description", content: "Live business performance overview and KPIs." },
      { property: "og:title", content: "Dashboard — KPIOptiva" },
      { property: "og:description", content: "Live business performance overview and KPIs." },
    ],
  }),
  component: Dashboard,
});

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive"
          ? "text-destructive"
          : "text-primary";
  return (
    <Card className="surface-card border-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className={`size-4 shrink-0 ${toneClass}`} />
        </div>
        <p className="mt-3 truncate font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { businessId, currency } = useBusiness();
  const [range, setRange] = useState("30");
  const from = daysAgoISO(Number(range));
  const today = todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", businessId, range],
    enabled: !!businessId,
    queryFn: async () => {
      const [sales, expenses, products, ar, ap, cash, saleItems, customers, logs] =
        await Promise.all([
          db.from("sales").select("*").eq("business_id", businessId).gte("sale_date", from),
          db.from("expenses").select("*").eq("business_id", businessId).gte("expense_date", from),
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

    const todayRows = d.sales.filter((s) => s.sale_date === today);
    const todayExpenses = d.expenses.filter((e) => e.expense_date === today);
    const period = salesMetrics(d.sales);
    const todayM = salesMetrics(todayRows);

    const revenue = period.revenue;
    const cogs = period.cogs;
    const expenseTotal = sum(d.expenses, "amount");
    const grossProfit = period.grossProfit;
    const netProfit = grossProfit - expenseTotal;
    const cashIn = sum(d.cash.filter((c) => c.type === "in"), "amount");
    const cashOut = sum(d.cash.filter((c) => c.type === "out"), "amount");
    const inventoryValue = inventoryValueOf(d.products);
    const lowStock = d.products.filter(
      (p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.reorder_level ?? 0),
    );
    const outOfStock = d.products.filter((p) => Number(p.stock) <= 0);
    const receivables = d.ar.reduce((a, r) => a + (Number(r.amount) - Number(r.paid)), 0);
    const payables = d.ap.reduce((a, r) => a + (Number(r.amount) - Number(r.paid)), 0);

    // time series
    const byDay = new Map<string, { date: string; sales: number; expenses: number }>();
    for (const s of d.sales) {
      const net = saleNetRevenue(s);
      if (!net) continue;
      const k = s.sale_date;
      const e = byDay.get(k) ?? { date: k, sales: 0, expenses: 0 };
      e.sales += net;
      byDay.set(k, e);
    }
    for (const x of d.expenses) {
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
    for (const x of d.expenses) {
      byCat.set(x.category ?? "other", (byCat.get(x.category ?? "other") ?? 0) + Number(x.amount ?? 0));
    }
    const expenseMix = Array.from(byCat.entries()).map(([name, value]) => ({ name, value }));

    // top customers
    const byCustomer = new Map<string, number>();
    for (const s of d.sales) {
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

    return {
      todaySales: todayM.revenue,
      todayExpenses: sum(todayExpenses, "amount"),
      todayProfit: todayM.grossProfit - sum(todayExpenses, "amount"),
      revenue,
      netProfit,
      grossProfit,
      cashOnHand: cashIn - cashOut,
      inventoryValue,
      receivables,
      payables,
      lowStock,
      outOfStock,
      series,
      bestSellers,
      expenseMix,
      topCustomers,
      margin,
      expenseRatio,
      aov,
      health,
      logs: d.logs,
    };
  }, [data, today]);

  if (isLoading || !m) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Loading your business performance..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const chartColors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 sm:grid-cols-2 stagger-grid">
          <KpiCard label="Revenue (period)" value={formatCurrency(m.revenue, currency)} sub={`Avg order ${formatCurrency(m.aov, currency)}`} icon={TrendingUp} />
          <KpiCard label="Net Profit (period)" value={formatCurrency(m.netProfit, currency)} sub={`${m.margin.toFixed(1)}% margin`} icon={Activity} tone={m.netProfit >= 0 ? "success" : "destructive"} />
          <KpiCard label="Cash On Hand" value={formatCurrency(m.cashOnHand, currency)} icon={Wallet} />
          <KpiCard label="Inventory Value" value={formatCurrency(m.inventoryValue, currency)} icon={Boxes} />
        </div>
        <Card className="surface-card overflow-hidden border-0">
          <CardContent className="p-2">
            <KpiOrb
              score={m.health}
              caption={`Expense ratio ${m.expenseRatio.toFixed(1)}%`}
            />
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
          <div className="mt-4 grid gap-4 stagger-grid sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Today's Sales" value={formatCurrency(m.todaySales, currency)} icon={TrendingUp} tone="success" />
        <KpiCard label="Today's Expenses" value={formatCurrency(m.todayExpenses, currency)} icon={TrendingDown} tone="warning" />
        <KpiCard label="Today's Profit" value={formatCurrency(m.todayProfit, currency)} icon={Activity} />
        <KpiCard label="Cash On Hand" value={formatCurrency(m.cashOnHand, currency)} icon={Wallet} />
        <KpiCard label="Outstanding Receivables" value={formatCurrency(m.receivables, currency)} icon={ArrowDownLeft} tone="warning" />
        <KpiCard label="Outstanding Payables" value={formatCurrency(m.payables, currency)} icon={ArrowUpRight} tone="warning" />
        <KpiCard label="Low Stock Items" value={formatNumber(m.lowStock.length)} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Out Of Stock" value={formatNumber(m.outOfStock.length)} icon={PackageX} tone="destructive" />
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
                  <Area type="monotone" dataKey="sales" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
                  <Area type="monotone" dataKey="expenses" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.12} />
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
                  <Pie data={m.expenseMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
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
                  <Bar dataKey="revenue" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
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
