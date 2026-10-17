/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { resolveImageSrc } from "@/lib/storage-images";

/** Thermal-style receipt for completed POS sales. */
export async function printReceipt({
  business,
  sale,
  items,
  payments,
  customer,
  cashier,
  currency,
  taxName = "Tax",
}: {
  business: Row | null;
  sale: Row;
  items: Row[];
  payments: Row[];
  customer?: Row | null;
  cashier?: string | null;
  currency: string;
  taxName?: string;
}) {
  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) return false;
  const logoSrc = await resolveImageSrc(business?.logo_url);

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

  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(sale.sale_number)}</title>
  <style>
    body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111;margin:0;padding:16px;width:320px}
    h1{font-size:16px;margin:0;text-align:center}
    .muted{color:#666;font-size:11px}
    .center{text-align:center}
    hr{border:none;border-top:1px dashed #999;margin:10px 0}
    table{width:100%;border-collapse:collapse}
    td{font-size:12px;padding:3px 0;vertical-align:top}
    .num{text-align:right;white-space:nowrap}
    .tot div{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
    .tot .grand{font-weight:700;font-size:14px;border-top:1px solid #111;margin-top:4px;padding-top:4px}
  </style></head><body>
  ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Business logo" style="display:block;max-width:120px;max-height:64px;margin:0 auto 8px;object-fit:contain" />` : ""}
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
    <div><span>${esc(taxName)}</span><span>${money(sale.tax)}</span></div>
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
  <div class="center muted">Thank you!</div>
  <script>window.onload=()=>{window.print()}</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
  return true;
}
