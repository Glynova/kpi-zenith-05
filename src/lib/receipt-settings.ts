export type ReceiptPaperWidth = "58mm" | "80mm" | "custom";
export type ReceiptFontSize = "small" | "medium" | "large";

export type ReceiptMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ReceiptSettings = {
  printFormat: "thermal";
  paperWidth: ReceiptPaperWidth;
  customWidthMm: number;
  marginMode: "automatic" | "custom";
  margins: ReceiptMargins;
  fontSize: ReceiptFontSize;
  showBusinessLogo: boolean;
  showTaxDetails: boolean;
  footer: string;
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  printFormat: "thermal",
  paperWidth: "80mm",
  customWidthMm: 80,
  marginMode: "automatic",
  margins: { top: 4, right: 3, bottom: 4, left: 3 },
  fontSize: "medium",
  showBusinessLogo: true,
  showTaxDetails: true,
  footer: "Thank you!",
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeReceiptSettings(value: unknown): ReceiptSettings {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const inputMargins =
    input.margins && typeof input.margins === "object"
      ? (input.margins as Record<string, unknown>)
      : {};

  return {
    printFormat: "thermal",
    paperWidth:
      input.paperWidth === "58mm" || input.paperWidth === "custom" ? input.paperWidth : "80mm",
    customWidthMm: boundedNumber(
      input.customWidthMm,
      DEFAULT_RECEIPT_SETTINGS.customWidthMm,
      40,
      120,
    ),
    marginMode: input.marginMode === "custom" ? "custom" : "automatic",
    margins: {
      top: boundedNumber(inputMargins.top, DEFAULT_RECEIPT_SETTINGS.margins.top, 0, 20),
      right: boundedNumber(inputMargins.right, DEFAULT_RECEIPT_SETTINGS.margins.right, 0, 20),
      bottom: boundedNumber(inputMargins.bottom, DEFAULT_RECEIPT_SETTINGS.margins.bottom, 0, 20),
      left: boundedNumber(inputMargins.left, DEFAULT_RECEIPT_SETTINGS.margins.left, 0, 20),
    },
    fontSize: input.fontSize === "small" || input.fontSize === "large" ? input.fontSize : "medium",
    showBusinessLogo:
      typeof input.showBusinessLogo === "boolean"
        ? input.showBusinessLogo
        : DEFAULT_RECEIPT_SETTINGS.showBusinessLogo,
    showTaxDetails:
      typeof input.showTaxDetails === "boolean"
        ? input.showTaxDetails
        : DEFAULT_RECEIPT_SETTINGS.showTaxDetails,
    footer:
      typeof input.footer === "string"
        ? input.footer.slice(0, 240)
        : DEFAULT_RECEIPT_SETTINGS.footer,
  };
}

export function receiptWidthMm(settings: ReceiptSettings): number {
  if (settings.paperWidth === "58mm") return 58;
  if (settings.paperWidth === "80mm") return 80;
  return boundedNumber(settings.customWidthMm, 80, 40, 120);
}

export function receiptMarginsMm(settings: ReceiptSettings): ReceiptMargins {
  return settings.marginMode === "automatic" ? DEFAULT_RECEIPT_SETTINGS.margins : settings.margins;
}

export function receiptFontPt(size: ReceiptFontSize): number {
  return size === "small" ? 8 : size === "large" ? 12 : 10;
}
