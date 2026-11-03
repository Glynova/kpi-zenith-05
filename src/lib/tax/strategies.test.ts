import { describe, expect, it } from "vitest";
import { resolveStrategy, ScPwdDiscount, summarize, VatExclusive, VatInclusive, ZeroRated } from "./strategies";

describe("PH tax strategies", () => {
  it("VAT-inclusive ₱112 splits into ₱100 vatable + ₱12 VAT", () => {
    const b = VatInclusive.compute(112);
    expect(b.vatable_sales).toBe(100);
    expect(b.vat_amount).toBe(12);
    expect(b.total).toBe(112);
  });

  it("VAT-exclusive ₱100 adds ₱12 VAT", () => {
    expect(VatExclusive.compute(100).total).toBe(112);
  });

  it("SC/PWD on ₱112 removes VAT then 20% off: pays ₱80", () => {
    const b = ScPwdDiscount.compute(112);
    expect(b.vat_exempt_sales).toBe(100);
    expect(b.statutory_discount).toBe(20);
    expect(b.vat_amount).toBe(0);
    expect(b.total).toBe(80);
  });

  it("zero-rated carries no VAT", () => {
    const b = ZeroRated.compute(500);
    expect(b.zero_rated_sales).toBe(500);
    expect(b.vat_amount).toBe(0);
  });

  it("exempt items never get SC/PWD VAT removal twice", () => {
    expect(resolveStrategy({ taxType: "VAT_EXEMPT", taxInclusive: true, scPwd: true }).kind).toBe("vat_exempt");
    expect(resolveStrategy({ taxType: "VAT", taxInclusive: true, scPwd: true }).kind).toBe("sc_pwd");
  });

  it("summarizes mixed receipts", () => {
    const s = summarize([VatInclusive.compute(112), ZeroRated.compute(50)]);
    expect(s.total).toBe(162);
    expect(s.vat_amount).toBe(12);
  });
});

import { orderVatBreakdown } from "@/lib/sales";
describe("orderVatBreakdown", () => {
  it("splits VAT and exempt lines and reconciles to totals", () => {
    const b = orderVatBreakdown(
      [
        { quantity: 1, unit_price: 112, tax_type: "VAT", tax_rate: 12 } as never,
        { quantity: 1, unit_price: 50, tax_type: "VAT_EXEMPT", tax_rate: 0 } as never,
      ],
      { taxInclusive: true },
    );
    expect(b).toEqual({ vatable: 100, vat: 12, exempt: 50, zeroRated: 0 });
  });
  it("SC/PWD reclassified lines carry no VAT", () => {
    const b = orderVatBreakdown([{ quantity: 1, unit_price: 35, tax_type: "VAT_EXEMPT", tax_rate: 0 } as never], {
      orderDiscount: 20, orderDiscountType: "percent",
    });
    expect(b).toEqual({ vatable: 0, vat: 0, exempt: 28, zeroRated: 0 });
  });
});
