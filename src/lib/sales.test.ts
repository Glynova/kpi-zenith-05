import { describe, expect, it } from "vitest";

import { orderTotals, type CartLine } from "./sales";

function line(
  quantity: number,
  unit_price: number,
  tax_rate: number,
  discount = 0,
  discount_type: CartLine["discount_type"] = "amount",
): CartLine {
  return {
    key: `${quantity}-${unit_price}`,
    product_id: "product",
    product_name: "Test item",
    quantity,
    unit_price,
    unit_cost: 0,
    discount,
    discount_type,
    tax_rate,
  };
}

describe("sale totals", () => {
  it("calculates one item with 12% exclusive tax", () => {
    expect(orderTotals([line(1, 35, 12)])).toMatchObject({
      subtotal: 35,
      discount: 0,
      tax: 4.2,
      total: 39.2,
    });
  });

  it("sums rounded lines with different quantities", () => {
    expect(orderTotals([line(2, 70, 12), line(3, 35, 12)])).toMatchObject({
      subtotal: 245,
      discount: 0,
      tax: 29.4,
      total: 274.4,
    });
  });

  it("applies item and percentage order discounts before scaling tax", () => {
    expect(
      orderTotals([line(2, 50, 12, 10)], {
        orderDiscount: 10,
        orderDiscountType: "percent",
      }),
    ).toMatchObject({ subtotal: 90, discount: 19, tax: 9.72, total: 90.72 });

    expect(orderTotals([line(1, 35, 12, 10, "percent")])).toMatchObject({
      subtotal: 31.5,
      discount: 3.5,
      tax: 3.78,
      total: 35.28,
    });
  });

  it("rounds decimal line prices before summing", () => {
    expect(orderTotals([line(3, 9.99, 12)])).toMatchObject({
      subtotal: 29.97,
      discount: 0,
      tax: 3.6,
      total: 33.57,
    });
  });

  it("does not add embedded tax a second time for inclusive prices", () => {
    expect(orderTotals([line(1, 112, 12)], { taxInclusive: true })).toMatchObject({
      subtotal: 100,
      discount: 0,
      tax: 12,
      total: 112,
    });

    expect(orderTotals([line(1, 112, 12, 10)], { taxInclusive: true })).toMatchObject({
      subtotal: 91.07,
      discount: 10,
      tax: 10.93,
      total: 102,
    });

    expect(
      orderTotals([line(1, 112, 12)], {
        taxInclusive: true,
        orderDiscount: 10,
        orderDiscountType: "amount",
      }),
    ).toMatchObject({ subtotal: 100, discount: 10, tax: 10.8, total: 100.8 });
  });
});
