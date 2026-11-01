import { describe, expect, it } from "vitest";

import { toStockUnit, unitsFor, type UnitConversionRule } from "@/lib/units";

const globalRules: UnitConversionRule[] = [
  { product_id: null, from_unit: "case", to_unit: "pcs", factor: 24 },
];

describe("item unit conversions", () => {
  it("keeps the stock unit and adds matching global fallback units", () => {
    expect(unitsFor("pcs", globalRules)).toContain("case");
    expect(toStockUnit(2, "case", "pcs", globalRules)).toBe(48);
  });

  it("prioritizes an item rule over a global rule", () => {
    const rules = [
      ...globalRules,
      { product_id: "product-a", from_unit: "case", to_unit: "pcs", factor: 12 },
    ];
    expect(toStockUnit(2, "case", "pcs", rules, "product-a")).toBe(24);
    expect(toStockUnit(2, "case", "pcs", rules, "product-b")).toBe(48);
  });

  it("prioritizes a variant rule over whole-item and global rules", () => {
    const rules = [
      ...globalRules,
      { product_id: "product-a", variant_id: null, from_unit: "case", to_unit: "pcs", factor: 12 },
      {
        product_id: "product-a",
        variant_id: "variant-a",
        from_unit: "case",
        to_unit: "pcs",
        factor: 10,
      },
    ];
    expect(toStockUnit(1, "case", "pcs", rules, "product-a", "variant-a")).toBe(10);
    expect(toStockUnit(1, "case", "pcs", rules, "product-a", "variant-b")).toBe(12);
  });

  it("supports reverse lookup for a direct positive conversion rule", () => {
    expect(toStockUnit(24, "pcs", "case", globalRules)).toBe(1);
    expect(unitsFor("case", globalRules)).toContain("pcs");
  });
});
