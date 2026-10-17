/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { resolveImageSrc } from "@/lib/storage-images";
import {
  normalizeReceiptSettings,
  receiptFontPt,
  receiptMarginsMm,
  receiptWidthMm,
} from "@/lib/receipt-settings";

type ReceiptInput = {
  business: Row | null;
  sale: Row;
  items: Row[];
  payments: Row[];
  customer?: Row | null;
  cashier?: string | null;
  currency: string;
  taxName?: string;
  receiptSettings?: unknown;
};

/** Thermal-style receipt for completed POS sales. */
export function printReceipt(input: ReceiptInput) {
  return renderReceipt(input, true);
}

/** Opens the same thermal receipt markup without starting the print dialog. */
export function previewReceipt(input: ReceiptInput) {
  return renderReceipt(input, false);
}

async function renderReceipt(
  {
    business,
    sale,
    items,
    payments,
    customer,
    cashier,
    currency,
    taxName = "Tax",
    receiptSettings,
  }: ReceiptInput,
  autoPrint: boolean,
) {
  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) return false;
  const options = normalizeReceiptSettings(receiptSettings);
  const paperWidth = receiptWidthMm(options);
  const margins = receiptMarginsMm(options);
  const fontSize = receiptFontPt(options.fontSize);
  const logoSrc = options.showBusinessLogo ? await resolveImageSrc(business?.logo_url) : null;

  const esc = (v: any) =>
    String(v ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );
  const money = (n: number) => esc(formatCurrency(Number(n ?? 0), currency));

  const tendered = payments.reduce((s, p) => s + Number(p.tendered ?? p.amount ?? 0), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const change = Math.max(tendered - paid, 0);

  const lines = items
    .map(
      (i) =>
        `<tr><td>${esc(i.product_name)}${
          i.variant_name ? `<div class="muted">${esc(i.variant_name)}</div>` : ""
        }<div class="muted">${esc(Number(i.quantity))} × ${money(i.unit_price)}${
          Number(i.discount) > 0 ? ` − ${money(i.discount)}` : ""
        }</div></td><td class="num">${money(i.total)}</td></tr>`,
    )
    .join("");

  const payRows = payments
    .map(
      (p) =>
        `<div><span>${esc(String(p.method).replace(/_/g, " "))}</span><span>${money(p.amount)}</span></div>`,
    )
    .join("");
  const taxRow =
    options.showTaxDetails && Number(sale.tax) > 0
      ? `<div><span>${esc(taxName)}</span><span>${money(sale.tax)}</span></div>`
      : "";
  const footer = options.footer.trim()
    ? `<div class="center muted footer">${esc(options.footer.trim())}</div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(sale.sale_number)}</title>
  <style>
    @page{size:${paperWidth}mm auto;margin:0}
    *{box-sizing:border-box}
    body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111;margin:0 auto;padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;width:${paperWidth}mm;font-size:${fontSize}pt}
    h1{font-size:${fontSize + 3}pt;margin:0;text-align:center}
    .muted{color:#555;font-size:${Math.max(7, fontSize - 2)}pt}
    .footer{margin-top:10px;white-space:pre-wrap}
    .center{text-align:center}
    hr{border:none;border-top:1px dashed #999;margin:10px 0}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    td{font-size:${fontSize}pt;padding:3px 0;vertical-align:top;overflow-wrap:anywhere}
    .num{text-align:right;white-space:nowrap}
    .tot div{display:flex;justify-content:space-between;gap:8px;font-size:${fontSize}pt;padding:2px 0}
    .tot .grand{font-weight:700;font-size:${fontSize + 2}pt;border-top:1px solid #111;margin-top:4px;padding-top:4px}
  </style></head><body>
  ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Business logo" style="display:block;max-width:100%;max-height:22mm;margin:0 auto 8px;object-fit:contain" />` : ""}
  <h1>${esc(business?.name ?? "Receipt")}</h1>
  <div class="center muted">${esc(business?.address ?? "")}</div>
  <div class="center muted">${esc(business?.phone ?? "")} ${esc(business?.email ?? "")}</div>
  <hr />
  <div class="muted">Receipt: ${esc(sale.sale_number)}</div>
  <div class="muted">Date: ${esc(new Date(sale.created_at ?? Date.now()).toLocaleString())}</div>
  ${cashier ? `<div class="muted">Cashier: ${esc(cashier)}</div>` : ""}
  <div class="muted">Customer: ${esc(customer?.name ?? "Walk-in")}</div>
  <hr />
  <table>${lines}</table>
  <hr />
  <div class="tot">
    <div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    <div><span>Discount</span><span>-${money(sale.discount)}</span></div>
    ${taxRow}
    ${Number(sale.shipping) > 0 ? `<div><span>Shipping</span><span>${money(sale.shipping)}</span></div>` : ""}
    <div class="grand"><span>Total</span><span>${money(sale.total)}</span></div>
    ${payRows}
    <div><span>Amount paid</span><span>${money(paid)}</span></div>
    ${change > 0 ? `<div><span>Change</span><span>${money(change)}</span></div>` : ""}
    ${
      Number(sale.total) - paid > 0.009
        ? `<div><span>Balance due</span><span>${money(Number(sale.total) - paid)}</span></div>`
        : ""
    }
  </div>
  <hr />
  ${footer}
  ${autoPrint ? "<script>window.onload=()=>{window.print()}</script>" : ""}
  </body></html>`;

  win.document.write(html);
  win.document.close();
  return true;
}
