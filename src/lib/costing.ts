/**
 * Pure mirrors of the database costing engine (apply_inventory_movement /
 * apply_cost_layers). The database stays the source of truth; these helpers
 * exist so the UI/reports use the same rules and so the rules are tested.
 *
 * Identity: business -> product -> variant (SKU) -> location. Costs never mix
 * across variants or locations.
 */

export type StockKey = { productId: string; variantId: string | null; warehouseId: string | null };

export function stockKey(k: StockKey): string {
  return `${k.productId}::${k.variantId ?? ""}::${k.warehouseId ?? ""}`;
}

/** New Average = (Qty × Avg + RecvQty × RecvCost) / (Qty + RecvQty). */
export function weightedAverageCost(
  existingQty: number,
  existingAvg: number,
  receivedQty: number,
  receiptUnitCost: number,
): number {
  const total = existingQty + receivedQty;
  if (receivedQty <= 0 || receiptUnitCost <= 0 || total <= 0) return existingAvg;
  return (existingQty * existingAvg + receivedQty * receiptUnitCost) / total;
}

export type CostLayer = { quantity: number; unitCost: number };

/** Consume FIFO layers (oldest first). Returns COGS and the remaining layers. */
export function consumeFifo(layers: CostLayer[], qty: number) {
  let need = qty;
  let cogs = 0;
  const remaining: CostLayer[] = [];
  for (const l of layers) {
    if (need <= 0) {
      remaining.push({ ...l });
      continue;
    }
    const take = Math.min(need, l.quantity);
    cogs += take * l.unitCost;
    need -= take;
    if (l.quantity - take > 0) remaining.push({ quantity: l.quantity - take, unitCost: l.unitCost });
  }
  return { cogs, remaining, shortfall: Math.max(need, 0) };
}

export function fifoValue(layers: CostLayer[]) {
  return layers.reduce((s, l) => s + l.quantity * l.unitCost, 0);
}

export function lineMargin(qty: number, snapshotPrice: number, unitCogs: number) {
  const revenue = qty * snapshotPrice;
  const cogs = qty * unitCogs;
  const grossProfit = revenue - cogs;
  const marginPercent = revenue === 0 ? 0 : Math.round((grossProfit / revenue) * 10000) / 100;
  return { revenue, cogs, grossProfit, marginPercent };
}

export type VariantBalance = StockKey & { quantity: number; averageCost: number };

/** Value per exact variant + location. */
export function valueByVariantLocation(balances: VariantBalance[]) {
  const out = new Map<string, { quantity: number; value: number }>();
  for (const b of balances) {
    const k = stockKey(b);
    const cur = out.get(k) ?? { quantity: 0, value: 0 };
    cur.quantity += b.quantity;
    cur.value += b.quantity * b.averageCost;
    out.set(k, cur);
  }
  return out;
}

/**
 * Parent totals are aggregates of variant rows only. When a product has
 * variants, any variant_id = null balance (legacy parent-level stock) is
 * ignored so parent + variants are never double-counted.
 */
export function parentAggregate(balances: VariantBalance[], productHasVariants: boolean) {
  const rows = productHasVariants ? balances.filter((b) => b.variantId) : balances;
  return rows.reduce(
    (a, b) => ({ stock: a.stock + b.quantity, value: a.value + b.quantity * b.averageCost }),
    { stock: 0, value: 0 },
  );
}

/** Resolve the price to snapshot on a sale line: the exact variant's, else the parent's. */
export function resolveUnitPrice(
  product: { selling_price?: number | null },
  variant?: { selling_price?: number | null } | null,
) {
  if (variant && variant.selling_price != null) return Number(variant.selling_price);
  return Number(product.selling_price ?? 0);
}

/**
 * Variant generation uses parent price/cost only as defaults; existing
 * explicit variant values are kept.
 */
export function inheritDefaults<T extends { cost_price?: number | null; selling_price?: number | null }>(
  variant: T,
  parent: { cost_price: number; selling_price: number },
): T {
  return {
    ...variant,
    cost_price: variant.cost_price ?? parent.cost_price,
    selling_price: variant.selling_price ?? parent.selling_price,
  };
}
