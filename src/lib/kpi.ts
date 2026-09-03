/**
 * Single source of truth for KPI maths.
 *
 * Every screen (dashboard, analytics, reports) must use these helpers so the
 * same number never has two definitions. Rules encoded here:
 *
 * - Only posted sales count. Quotes, sales orders, drafts, voided and
 *   cancelled documents are excluded — they are commitments, not revenue.
 * - Returns subtract. A return document carries positive amounts, so its sign
 *   is flipped for revenue and its (already negative) cost is flipped back.
 * - Revenue is net of tax, shipping and other charges. Tax collected for the
 *   government and freight recharges are not margin.
 * - Inventory is valued at average (actual) cost when known, falling back to
 *   the entered cost price.
 */
import type { Row } from "@/lib/db";

const EXCLUDED_STATUSES = new Set(["draft", "voided", "cancelled", "rejected", "expired"]);
const NON_REVENUE_DOCS = new Set(["quote", "sales_order"]);

export function isPostedSale(sale: Row): boolean {
  if (NON_REVENUE_DOCS.has(String(sale.document_type ?? "sale"))) return false;
  if (EXCLUDED_STATUSES.has(String(sale.status ?? ""))) return false;
  // inventory_posted is set by complete_sale()/post_sales_return(); rows that
  // predate it fall back to their status.
  if (sale.inventory_posted === false && sale.status !== "completed") return false;
  return true;
}

/** Returns reverse revenue and cost. */
export function saleSign(sale: Row): number {
  return String(sale.document_type ?? "") === "return" ? -1 : 1;
}

export type SalesMetrics = {
  /** Net revenue: excludes tax, shipping and other charges. */
  revenue: number;
  /** What the customer paid in total, tax included. */
  grossSales: number;
  tax: number;
  discount: number;
  cogs: number;
  grossProfit: number;
  orders: number;
  aov: number;
};

export function salesMetrics(sales: Row[]): SalesMetrics {
  let revenue = 0;
  let grossSales = 0;
  let tax = 0;
  let discount = 0;
  let cogs = 0;
  let orders = 0;

  for (const s of sales) {
    if (!isPostedSale(s)) continue;
    const sign = saleSign(s);
    const total = Number(s.total ?? 0);
    const t = Number(s.tax ?? 0);
    const extras = Number(s.shipping ?? 0) + Number(s.other_charges ?? 0);
    revenue += sign * (total - t - extras);
    grossSales += sign * total;
    tax += sign * t;
    discount += sign * Number(s.discount ?? 0);
    // cost_total is stored negative on returns, so the sign flip restores it.
    cogs += sign * Number(s.cost_total ?? 0);
    if (sign > 0) orders += 1;
  }

  const grossProfit = revenue - cogs;
  return {
    revenue: round2(revenue),
    grossSales: round2(grossSales),
    tax: round2(tax),
    discount: round2(discount),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    orders,
    aov: orders ? round2(revenue / orders) : 0,
  };
}

/** Net revenue of a single sale — used for time series and customer ranking. */
export function saleNetRevenue(sale: Row): number {
  if (!isPostedSale(sale)) return 0;
  return (
    saleSign(sale) *
    (Number(sale.total ?? 0) -
      Number(sale.tax ?? 0) -
      Number(sale.shipping ?? 0) -
      Number(sale.other_charges ?? 0))
  );
}

/** Stock value at actual cost, falling back to the entered cost price. */
export function inventoryValueOf(products: Row[]): number {
  return round2(
    products.reduce(
      (a, p) => a + Number(p.stock ?? 0) * Number(p.average_cost || p.cost_price || 0),
      0,
    ),
  );
}

export function marginPercent(profit: number, revenue: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

/**
 * Business health, 0–100. Weighted, documented and shared everywhere:
 * profitability 40, activity 15, cash 20, stock availability 15, liquidity 10.
 */
export function healthScore(input: {
  netMargin: number;
  revenue: number;
  netCashFlow: number;
  outOfStock: number;
  productCount: number;
  receivables: number;
  payables: number;
}): number {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  // 0% margin scores half, 20%+ scores full, -20% or worse scores zero.
  const profitability = clamp((input.netMargin + 20) / 40, 0, 1) * 40;
  const activity = input.revenue > 0 ? 15 : 0;
  const cash = input.netCashFlow > 0 ? 20 : input.netCashFlow === 0 ? 10 : 0;
  const availability =
    input.productCount > 0 ? clamp(1 - input.outOfStock / input.productCount, 0, 1) * 15 : 15;
  const liquidity = input.payables > 0 ? clamp(input.receivables / input.payables, 0, 1) * 10 : 10;

  return Math.round(profitability + activity + cash + availability + liquidity);
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
