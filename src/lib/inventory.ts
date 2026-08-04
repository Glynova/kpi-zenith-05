/**
 * Shared helpers for the universal inventory engine.
 *
 * The inventory_movements table is the auditable source of truth; balances are
 * maintained by database triggers. Everything here mirrors that contract so the
 * UI never invents its own stock maths.
 */

/** Movement types supported by the engine, grouped for the UI. */
export const MOVEMENT_GROUPS: { label: string; types: string[] }[] = [
  { label: "Receipts", types: ["opening_balance", "purchase", "return_in", "production_in", "transfer_in", "adjustment_in"] },
  { label: "Issues", types: ["sale", "return_out", "consumption", "production_out", "transfer_out", "adjustment_out", "waste", "damage"] },
  { label: "Counts", types: ["stock_count"] },
];

export const ALL_MOVEMENT_TYPES = MOVEMENT_GROUPS.flatMap((g) => g.types);

const IN_TYPES = new Set([
  "stock_in",
  "purchase",
  "return_in",
  "adjustment_in",
  "transfer_in",
  "production",
  "production_in",
  "opening_balance",
]);

const OUT_TYPES = new Set([
  "stock_out",
  "sale",
  "return_out",
  "adjustment_out",
  "transfer_out",
  "consumption",
  "production_out",
  "damage",
  "waste",
]);

/** Same sign rules as the database movement_sign() function. */
export function movementSign(type: string): number {
  if (IN_TYPES.has(type)) return 1;
  if (OUT_TYPES.has(type)) return -1;
  return 0;
}

export const ADJUSTMENT_REASONS = [
  "Damaged",
  "Expired",
  "Lost",
  "Counting error",
  "Manual correction",
  "Stock count",
  "Other",
];

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "overstocked" | "inactive";

export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  overstocked: "Overstocked",
  inactive: "Inactive",
};

/** Derived — never stored. */
export function stockStatus(
  quantity: number,
  opts: { reorderLevel?: number; minStock?: number; maxStock?: number | null; active?: boolean; rule?: string },
): StockStatus {
  if (opts.active === false) return "inactive";
  const qty = Number(quantity ?? 0);
  if (qty <= 0) return "out_of_stock";
  const max = opts.maxStock == null ? null : Number(opts.maxStock);
  if (max && qty > max) return "overstocked";
  const threshold =
    opts.rule === "min_stock" ? Number(opts.minStock ?? 0) : Number(opts.reorderLevel ?? 0);
  if (opts.rule !== "zero" && threshold > 0 && qty <= threshold) return "low_stock";
  return "in_stock";
}

/** Available = on hand - reserved. */
export function availableQuantity(onHand: number, reserved: number) {
  return Number(onHand ?? 0) - Number(reserved ?? 0);
}

/** Inventory value at the balance's average cost. */
export function inventoryValue(quantity: number, cost: number) {
  return Number(quantity ?? 0) * Number(cost ?? 0);
}
