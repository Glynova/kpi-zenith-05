import { describe, expect, it } from "vitest";

import {
  consumeFifo,
  fifoValue,
  inheritDefaults,
  lineMargin,
  parentAggregate,
  resolveUnitPrice,
  valueByVariantLocation,
  weightedAverageCost,
} from "./costing";
import { routeCapability } from "./capabilities";
import { canAccessRoute } from "./permissions";
import { LEGACY_MASTER_DATA_ROUTES, parseMasterDataTab } from "@/components/master-data";

const tshirt = { selling_price: 150, cost_price: 100 };
const variants = {
  blkS: { sku: "TS-BLK-S", cost_price: 100, selling_price: 150 },
  blkL: { sku: "TS-BLK-L", cost_price: 120, selling_price: 180 },
  whtS: { sku: "TS-WHT-S", cost_price: 105, selling_price: 160 },
};

describe("variant pricing", () => {
  it("resolves the exact variant price, not the parent", () => {
    expect(resolveUnitPrice(tshirt, variants.blkL)).toBe(180);
    expect(resolveUnitPrice(tshirt, variants.whtS)).toBe(160);
    expect(resolveUnitPrice(tshirt, null)).toBe(150);
  });
  it("parent values are defaults only and never overwrite overrides", () => {
    expect(inheritDefaults({ cost_price: null, selling_price: null }, tshirt)).toMatchObject({
      cost_price: 100,
      selling_price: 150,
    });
    expect(inheritDefaults(variants.blkL, tshirt)).toMatchObject({ cost_price: 120, selling_price: 180 });
  });
});

describe("weighted average", () => {
  it("10 @ 100 + 5 @ 130 = 110", () => {
    expect(weightedAverageCost(10, 100, 5, 130)).toBe(110);
  });
  it("zero-cost receipts keep the existing average", () => {
    expect(weightedAverageCost(10, 100, 5, 0)).toBe(100);
  });
});

describe("FIFO", () => {
  it("sell 12 from 10@100 + 5@130 => COGS 1260, remaining 390", () => {
    const r = consumeFifo(
      [
        { quantity: 10, unitCost: 100 },
        { quantity: 5, unitCost: 130 },
      ],
      12,
    );
    expect(r.cogs).toBe(1260);
    expect(fifoValue(r.remaining)).toBe(390);
    expect(r.shortfall).toBe(0);
  });
});

describe("margin", () => {
  it("2 @ 180 with COGS 120 => 33.33%", () => {
    expect(lineMargin(2, 180, 120)).toEqual({
      revenue: 360,
      cogs: 240,
      grossProfit: 120,
      marginPercent: 33.33,
    });
  });
  it("zero revenue is safe", () => {
    expect(lineMargin(0, 0, 10).marginPercent).toBe(0);
  });
});

describe("valuation by variant + location and parent aggregation", () => {
  const balances = [
    { productId: "p", variantId: "blkS", warehouseId: "A", quantity: 10, averageCost: 100 },
    { productId: "p", variantId: "blkS", warehouseId: "B", quantity: 2, averageCost: 110 },
    { productId: "p", variantId: "blkL", warehouseId: "A", quantity: 5, averageCost: 120 },
    // legacy parent-level row must not be double-counted
    { productId: "p", variantId: null, warehouseId: "A", quantity: 17, averageCost: 100 },
  ];
  it("keeps each variant/location separate", () => {
    const m = valueByVariantLocation(balances);
    expect(m.get("p::blkS::A")).toEqual({ quantity: 10, value: 1000 });
    expect(m.get("p::blkS::B")).toEqual({ quantity: 2, value: 220 });
    expect(m.get("p::blkL::A")).toEqual({ quantity: 5, value: 600 });
  });
  it("parent = sum of variants only", () => {
    expect(parentAggregate(balances, true)).toEqual({ stock: 17, value: 1820 });
  });
});

describe("master data routes", () => {
  it("old routes map to Master Data tabs", () => {
    expect(LEGACY_MASTER_DATA_ROUTES).toEqual({
      "/categories": "categories",
      "/suppliers": "suppliers",
      "/locations": "locations",
    });
    expect(parseMasterDataTab("bogus")).toBe("categories");
  });
  it("master data is not gated by stock-quantity or unit-conversion capability", () => {
    expect(routeCapability("/inventory/master-data")).toBeUndefined();
    expect(canAccessRoute("inventory_staff", "/inventory/master-data")).toBe(true);
    expect(canAccessRoute("hr", "/inventory/master-data")).toBe(false);
  });
  it("unit conversion only gates the Units page, not products", () => {
    expect(routeCapability("/products")).toBeUndefined();
    expect(routeCapability("/units")).toBe("enable_unit_conversion");
  });
});
