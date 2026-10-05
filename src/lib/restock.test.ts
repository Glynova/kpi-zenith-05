import { describe, expect, it } from "vitest";
import { needsRestock, suggestedPurchaseQty, suggestedStockQty } from "./restock";

describe("restock", () => {
  it("only lists items at or below a set alert level", () => {
    expect(needsRestock({ onHand: 6, alertLevel: 6 })).toBe(true);
    expect(needsRestock({ onHand: 7, alertLevel: 6 })).toBe(false);
    expect(needsRestock({ onHand: 0, alertLevel: 0 })).toBe(false);
  });
  it("suggests reorder qty, then max − on hand, then 2×alert − on hand", () => {
    expect(suggestedStockQty({ onHand: 3, alertLevel: 6, reorderQuantity: 10, maxStock: 50 })).toBe(
      10,
    );
    expect(suggestedStockQty({ onHand: 3, alertLevel: 6, maxStock: 20 })).toBe(17);
    expect(suggestedStockQty({ onHand: 3, alertLevel: 6 })).toBe(9);
  });
  it("rounds up to whole purchase units", () => {
    expect(suggestedPurchaseQty({ onHand: 3, alertLevel: 6, purchaseConversion: 24 })).toBe(1);
    expect(suggestedPurchaseQty({ onHand: 0, alertLevel: 30, purchaseConversion: 24 })).toBe(3);
  });
});
