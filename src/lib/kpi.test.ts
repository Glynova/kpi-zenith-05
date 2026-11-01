import { describe, expect, it } from "vitest";

import { healthScore, healthScoreFromRecords, type BusinessHealthInput } from "./kpi";

const baseInput: BusinessHealthInput = {
  businessType: "retail",
  netMargin: 0.05,
  revenue: 10_000,
  previousRevenue: 10_000,
  hasPreviousPeriod: true,
  operatingCashFlow: 0,
  cash: 0,
  receivables: 0,
  payablesDue: 0,
  hasSalesHistory: true,
  hasExpensesInPeriod: true,
  inventory: {
    inStockRate: 1,
    negativeStockShare: 0,
    deadStockShare: 0,
    expiryRiskShare: 0,
    hasExpiryData: true,
  },
};

function component(result: ReturnType<typeof healthScore>, key: string) {
  return result.components.find((entry) => entry.key === key)!;
}

describe("profile-based business health", () => {
  it("awards full retail profitability points at the 5% target margin", () => {
    const result = healthScore(baseInput);
    expect(component(result, "profitability").points).toBe(30);
  });

  it("scores a 5% services margin below its 15% target", () => {
    const result = healthScore({ ...baseInput, businessType: "services" });
    const profitability = component(result, "profitability");
    expect(profitability.points).toBeLessThan(profitability.maxPoints);
    expect(profitability.points).toBe(17.7);
  });

  it("omits inventory for services while retaining 100 total weight", () => {
    const result = healthScore({ ...baseInput, businessType: "services" });
    expect(result.components.some((entry) => entry.key === "inventory_health")).toBe(false);
    expect(result.components.reduce((sum, entry) => sum + entry.maxPoints, 0)).toBe(100);
  });

  it("includes cash in restaurant liquidity when receivables are zero", () => {
    const result = healthScore({
      ...baseInput,
      businessType: "restaurant",
      cash: 1_000,
      receivables: 0,
      payablesDue: 1_000,
    });
    expect(component(result, "liquidity").points).toBe(14);
  });

  it("reduces cash-flow points when operating cash flow is negative", () => {
    const noFlow = healthScore({ ...baseInput, operatingCashFlow: 0 });
    const negativeFlow = healthScore({ ...baseInput, operatingCashFlow: -1_000 });
    expect(component(negativeFlow, "cash_flow").points).toBeLessThan(
      component(noFlow, "cash_flow").points,
    );
  });

  it("excludes loan proceeds from operating cash flow", () => {
    const asOf = new Date("2026-11-01T12:00:00.000Z");
    const today = asOf.toISOString().slice(0, 10);
    const result = healthScoreFromRecords({
      businessType: "retail",
      sales: [
        {
          id: "sale-1",
          document_type: "sale",
          status: "completed",
          sale_date: today,
          total: 1_000,
          tax: 0,
          shipping: 0,
          other_charges: 0,
          cost_total: 0,
        },
      ],
      expenses: [{ expense_date: today, amount: 10 }],
      cashTransactions: [
        { transaction_date: today, type: "in", amount: 10_000, category: "Loan proceeds" },
      ],
      receivables: [],
      payables: [],
      products: [],
      variants: [],
      saleItems: [],
      inventoryMovements: [],
      batches: [],
      asOf,
    });
    expect(component(result, "cash_flow").points).toBe(10);
  });

  it("does not value a variant with unknown cost using the parent product cost", () => {
    const asOf = new Date("2026-11-02T12:00:00.000Z");
    const result = healthScoreFromRecords({
      businessType: "retail",
      sales: [
        {
          id: "sale-1",
          document_type: "sale",
          status: "completed",
          sale_date: "2026-11-01",
          total: 11,
          tax: 0,
          shipping: 0,
          other_charges: 0,
          cost_total: 0,
        },
      ],
      expenses: [{ expense_date: "2026-11-01", amount: 1 }],
      cashTransactions: [],
      receivables: [],
      payables: [],
      products: [
        {
          id: "product-1",
          stock: 2,
          average_cost: 100,
          cost_price: 100,
          created_at: "2025-01-01",
        },
      ],
      variants: [
        {
          id: "variant-1",
          product_id: "product-1",
          stock: 2,
          cost_price: 0,
          created_at: "2025-01-01",
        },
      ],
      saleItems: [
        {
          sale_id: "sale-1",
          product_id: "product-1",
          variant_id: "variant-1",
          total: 10,
        },
      ],
      inventoryMovements: [],
      batches: [],
      asOf,
    });

    expect(component(result, "inventory_health").points).toBe(15);
  });

  it("returns insufficient_data without a score when sales or period expenses are missing", () => {
    const result = healthScore({
      ...baseInput,
      hasSalesHistory: false,
      hasExpensesInPeriod: false,
    });
    expect(result.state).toBe("insufficient_data");
    expect(result.score).toBeNull();
    expect(result.notes).toHaveLength(2);
  });

  it("defaults an unset business type to the SME profile", () => {
    const result = healthScore({ ...baseInput, businessType: null });
    expect(result.notes[0]).toContain("SME default profile");
  });
});
