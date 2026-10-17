import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECEIPT_SETTINGS,
  normalizeReceiptSettings,
  receiptFontPt,
  receiptMarginsMm,
  receiptWidthMm,
} from "./receipt-settings";

describe("receipt settings", () => {
  it("uses safe thermal defaults and keeps A4 out of roll widths", () => {
    const settings = normalizeReceiptSettings(null);
    expect(settings).toEqual(DEFAULT_RECEIPT_SETTINGS);
    expect(settings.printFormat).toBe("thermal");
    expect(receiptWidthMm(settings)).toBe(80);
    expect(normalizeReceiptSettings({ paperWidth: "a4" }).paperWidth).toBe("80mm");
  });

  it("supports 58mm, 80mm and bounded custom widths", () => {
    expect(receiptWidthMm(normalizeReceiptSettings({ paperWidth: "58mm" }))).toBe(58);
    expect(receiptWidthMm(normalizeReceiptSettings({ paperWidth: "80mm" }))).toBe(80);
    expect(
      receiptWidthMm(normalizeReceiptSettings({ paperWidth: "custom", customWidthMm: 200 })),
    ).toBe(120);
  });

  it("resolves automatic/custom margins and font sizes", () => {
    expect(receiptMarginsMm(normalizeReceiptSettings({ marginMode: "automatic" }))).toEqual(
      DEFAULT_RECEIPT_SETTINGS.margins,
    );
    expect(
      receiptMarginsMm(normalizeReceiptSettings({ marginMode: "custom", margins: { left: 8 } }))
        .left,
    ).toBe(8);
    expect(receiptFontPt("small")).toBe(8);
    expect(receiptFontPt("medium")).toBe(10);
    expect(receiptFontPt("large")).toBe(12);
  });

  it("preserves show/hide controls and caps custom footer text", () => {
    const settings = normalizeReceiptSettings({
      showBusinessLogo: false,
      showTaxDetails: false,
      footer: "x".repeat(500),
    });
    expect(settings.showBusinessLogo).toBe(false);
    expect(settings.showTaxDetails).toBe(false);
    expect(settings.footer).toHaveLength(240);
  });
});
