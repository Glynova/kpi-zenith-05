/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";

export function printDocument({
  title,
  business,
  doc,
  party,
  items,
  currency,
  terms,
}: {
  title: string;
  business: Row | null;
  doc: Row;
  party?: Row | null;
  items: Row[];
  currency: string;
  terms?: string | null;
}) {
  const esc = (v: any) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

  const rows = items
    .map(
      (i) => `<tr>
        <td>${esc(i.product_name ?? "Item")}</td>
        <td class="num">${esc(Number(i.quantity ?? 0))}</td>
        <td class="num">${esc(formatCurrency(Number(i.unit_price ?? 0), currency))}</td>
        <td class="num">${esc(formatCurrency(Number(i.total ?? 0), currency))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" />
  <title>${esc(title)} ${esc(doc.invoice_number ?? doc.sale_number ?? doc.po_number ?? "")}</title>
  <style>
    *{box-sizing:border-box} body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:40px;}
    h1{font-size:24px;margin:0 0 4px} .muted{color:#64748b;font-size:12px}
    .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:13px}
    th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .totals{margin-top:16px;margin-left:auto;width:260px;font-size:13px}
    .totals div{display:flex;justify-content:space-between;padding:4px 0}
    .totals .grand{border-top:2px solid #0f172a;font-weight:700;font-size:15px;margin-top:6px;padding-top:8px}
    footer{margin-top:40px;font-size:11px;color:#64748b;white-space:pre-wrap}
  </style></head><body>
  <div class="head">
    <div>
      <h1>${esc(business?.name ?? "Business")}</h1>
      <div class="muted">${esc(business?.address ?? "")}</div>
      <div class="muted">${esc(business?.email ?? "")} ${esc(business?.phone ?? "")}</div>
    </div>
    <div style="text-align:right">
      <h1>${esc(title)}</h1>
      <div class="muted">#${esc(doc.invoice_number ?? doc.sale_number ?? doc.po_number ?? doc.id)}</div>
      <div class="muted">${esc(formatDate(doc.issue_date ?? doc.sale_date ?? doc.order_date ?? doc.created_at))}</div>
      ${doc.due_date ? `<div class="muted">Due ${esc(formatDate(doc.due_date))}</div>` : ""}
    </div>
  </div>
  ${party ? `<div class="muted">Billed to</div><div style="font-weight:600;margin-bottom:8px">${esc(party.name)}<div class="muted" style="font-weight:400">${esc(party.email ?? "")} ${esc(party.phone ?? "")}</div></div>` : ""}
  <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4" class="muted">No line items recorded.</td></tr>`}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${esc(formatCurrency(Number(doc.subtotal ?? 0), currency))}</span></div>
    <div><span>Discount</span><span>-${esc(formatCurrency(Number(doc.discount ?? 0), currency))}</span></div>
    <div><span>Tax</span><span>${esc(formatCurrency(Number(doc.tax ?? 0), currency))}</span></div>
    <div class="grand"><span>Total</span><span>${esc(formatCurrency(Number(doc.total ?? 0), currency))}</span></div>
    <div><span>Paid</span><span>${esc(formatCurrency(Number(doc.paid ?? 0), currency))}</span></div>
    <div><span>Balance</span><span>${esc(formatCurrency(Number(doc.total ?? 0) - Number(doc.paid ?? 0), currency))}</span></div>
  </div>
  <footer>${esc(terms ?? doc.terms ?? business?.invoice_terms ?? "")}</footer>
  <script>window.onload=()=>{window.print()}</script>
  </body></html>`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
