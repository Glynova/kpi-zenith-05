/** Restock list rules (spec 6.6). Quantities are in stock units unless noted. */
export type RestockInput = {
  onHand: number;
  alertLevel: number;
  reorderQuantity?: number | null;
  maxStock?: number | null;
  purchaseConversion?: number | null; // stock units per purchase unit
};

export function needsRestock(i: { onHand: number; alertLevel: number }) {
  return i.alertLevel > 0 && i.onHand <= i.alertLevel;
}

/** Suggested quantity in stock units: reorder qty, else max − on hand, else 2 × alert − on hand. */
export function suggestedStockQty(i: RestockInput) {
  let q: number;
  if (i.reorderQuantity && i.reorderQuantity > 0) q = i.reorderQuantity;
  else if (i.maxStock && i.maxStock > 0) q = i.maxStock - i.onHand;
  else q = 2 * i.alertLevel - i.onHand;
  return Math.max(q, 0);
}

/** Converted to purchase units, rounded up to whole purchase units. */
export function suggestedPurchaseQty(i: RestockInput) {
  const conv = i.purchaseConversion && i.purchaseConversion > 0 ? i.purchaseConversion : 1;
  return Math.ceil(suggestedStockQty(i) / conv - 1e-9);
}
