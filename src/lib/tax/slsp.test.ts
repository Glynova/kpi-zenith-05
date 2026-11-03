import { describe, expect, it } from "vitest";
import { buildSlsDat } from "./slsp";

const owner = { tin: "123-456-789-000", registered_name: "Beef n Buns", rdo_code: "050" };

describe("buildSlsDat", () => {
  it("groups sales per buyer TIN and totals the header", () => {
    const r = buildSlsDat(owner, [
      { buyer_tin: "111-222-333", buyer_name: "Acme", vatable_amount: 100, vat_amount: 12 },
      { buyer_tin: "111222333", buyer_name: "Acme", vatable_amount: 50, vat_amount: 6 },
      { buyer_tin: null, vatable_amount: 999, vat_amount: 119.88 },
    ], "2026-10-31");
    const [h, d] = r.content.trim().split("\r\n");
    expect(r.buyers).toBe(1);
    expect(r.skipped).toBe(1);
    expect(d).toContain('"111222333"');
    expect(d).toContain("0.00,0.00,150.00,18.00,123456789,10/31/2026");
    expect(h).toContain("0.00,0.00,150.00,18.00,050,10/31/2026");
  });
});
