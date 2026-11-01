/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row } from "@/lib/db";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { resolveImageSrc } from "@/lib/storage-images";
import { logPrintEvent } from "@/lib/audit";

export async function printDocument({
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
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  const logoSrc = await resolveImageSrc(business?.logo_url);
  const businessId = String(doc.business_id ?? business?.id ?? "");
  const isSaleDocument = ["sale", "pos_sale", "return"].includes(String(doc.document_type ?? ""));
  let compliance: Row = {};
  let provider: Row = {};
  let reprint = false;
  if (businessId) {
    const [
      { data: complianceRow, error: complianceError },
      { data: providerRow, error: providerError },
    ] = await Promise.all([
      db.from("business_compliance").select("*").eq("business_id", businessId).maybeSingle(),
      db.rpc("get_software_provider_settings"),
    ]);
    if (complianceError) throw complianceError;
    if (providerError) throw providerError;
    compliance = (complianceRow ?? {}) as Row;
    provider = (providerRow ?? {}) as Row;
    const action = await logPrintEvent(
      businessId,
      isSaleDocument ? "sales" : "purchasing",
      String(doc.sale_number ?? doc.invoice_number ?? doc.po_number ?? doc.id),
      { title, user_agent: navigator.userAgent },
    );
    reprint = action === "REPRINT";
  }
  const documentTitle = isSaleDocument
    ? String(compliance.invoice_title ?? "SALES INVOICE")
    : title;
  const branchTin = [compliance.tin, compliance.tin_branch_code].filter(Boolean).join("-");
  const vatStatusLine =
    compliance.jurisdiction !== "PH"
      ? ""
      : compliance.vat_registration_type === "vat"
        ? `VAT REG TIN: ${branchTin}`
        : compliance.vat_registration_type === "vat_exempt"
          ? `VAT-EXEMPT BUSINESS · TIN: ${branchTin}`
          : `NON-VAT REG TIN: ${branchTin}`;
  const buyerName = doc.statutory_buyer_name ?? party?.name;
  const buyerTin = doc.statutory_buyer_tin ?? party?.tax_id ?? party?.tin;
  const regularDiscount = Math.max(
    Number(doc.discount ?? 0) - Number(doc.statutory_discount_amount ?? 0),
    0,
  );

  const esc = (v: any) =>
    String(v ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );

  const rows = items
    .map(
      (i) => `<tr>
        <td>${esc(i.product_name ?? "Item")}</td>
        <td class="num">${esc(Number(i.quantity ?? 0))}</td>
        <td class="num">${esc(formatCurrency(Number(i.unit_price ?? 0), currency))}</td>
        <td>${esc(i.tax_type ?? "")}</td>
        <td class="num">${esc(formatCurrency(Number(i.total ?? 0), currency))}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" />
  <title>${esc(documentTitle)} ${esc(doc.invoice_number ?? doc.sale_number ?? doc.po_number ?? "")}</title>
  <style>
    *{box-sizing:border-box} body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:40px;}
    h1{font-size:24px;margin:0 0 4px} .muted{color:#64748b;font-size:12px}
    .business-logo{display:block;max-width:180px;max-height:72px;object-fit:contain;object-position:left center;margin-bottom:10px}
    .reprint{text-align:center;color:#b91c1c;font-weight:800;letter-spacing:.2em;margin-bottom:12px}
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
  ${reprint ? '<div class="reprint">REPRINT</div>' : ""}
  <div class="head">
    <div>
      ${logoSrc ? `<img class="business-logo" src="${esc(logoSrc)}" alt="Business logo" />` : ""}
      <h1>${esc(compliance.legal_name ?? business?.name ?? "Business")}</h1>
      ${compliance.trade_name ? `<div>${esc(compliance.trade_name)}</div>` : ""}
      ${isSaleDocument && compliance.jurisdiction === "PH" ? `<div class="muted">${esc(vatStatusLine)}</div>` : ""}
      <div class="muted">${esc(compliance.business_address ?? business?.address ?? "")}</div>
      <div class="muted">${esc(business?.email ?? "")} ${esc(business?.phone ?? "")}</div>
    </div>
    <div style="text-align:right">
      <h1>${esc(documentTitle)}</h1>
      <div class="muted">#${esc(doc.invoice_number ?? doc.sale_number ?? doc.po_number ?? doc.id)}</div>
      <div class="muted">${esc(new Date(doc.created_at ?? doc.issue_date ?? doc.sale_date ?? doc.order_date ?? Date.now()).toLocaleString())}</div>
      ${doc.due_date ? `<div class="muted">Due ${esc(formatDate(doc.due_date))}</div>` : ""}
    </div>
  </div>
  <div class="muted">${isSaleDocument ? "Buyer" : "Supplier"}</div><div style="font-weight:600;margin-bottom:8px">${esc(buyerName ?? party?.name ?? "Walk-in")}<div class="muted" style="font-weight:400">${esc(party?.address ?? "")}</div>${buyerTin ? `<div class="muted" style="font-weight:400">TIN: ${esc(buyerTin)}</div>` : ""}${doc.statutory_buyer_id ? `<div class="muted" style="font-weight:400">ID: ${esc(doc.statutory_buyer_id)}</div>` : ""}</div>
  <table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th>Tax type</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4" class="muted">No line items recorded.</td></tr>`}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${esc(formatCurrency(Number(doc.subtotal ?? 0), currency))}</span></div>
    <div><span>Discount</span><span>-${esc(formatCurrency(regularDiscount, currency))}</span></div>
    <div><span>Tax</span><span>${esc(formatCurrency(Number(doc.tax ?? 0), currency))}</span></div>
    ${
      isSaleDocument && compliance.jurisdiction === "PH"
        ? `
    <div><span>VATable sales</span><span>${esc(formatCurrency(Number(doc.vatable_amount ?? 0), currency))}</span></div>
    <div><span>VAT-exempt sales</span><span>${esc(formatCurrency(Number(doc.vat_exempt_amount ?? 0), currency))}</span></div>
    <div><span>Zero-rated sales</span><span>${esc(formatCurrency(Number(doc.zero_rated_amount ?? 0), currency))}</span></div>
    <div><span>VAT amount</span><span>${esc(formatCurrency(Number(doc.vat_amount ?? 0), currency))}</span></div>
    ${Number(doc.statutory_discount_amount ?? 0) > 0 ? `<div><span>${esc(String(doc.statutory_discount_type ?? "Statutory discount").replace(/_/g, " "))}</span><span>-${esc(formatCurrency(Number(doc.statutory_discount_amount), currency))}</span></div>` : ""}
    `
        : ""
    }
    <div class="grand"><span>Total</span><span>${esc(formatCurrency(Number(doc.total ?? 0), currency))}</span></div>
    <div><span>Paid</span><span>${esc(formatCurrency(Number(doc.paid ?? 0), currency))}</span></div>
    <div><span>Balance</span><span>${esc(formatCurrency(Number(doc.total ?? 0) - Number(doc.paid ?? 0), currency))}</span></div>
  </div>
  ${
    isSaleDocument && compliance.jurisdiction === "PH"
      ? `<footer>
  <div>POS accreditation no.: ${esc(compliance.pos_accreditation_no ?? "")} · PTU no.: ${esc(compliance.pos_ptu_no ?? "")} · MIN: ${esc(compliance.machine_id_no ?? "")}</div>
  <div>AC no.: ${esc(compliance.acknowledgement_certificate_no ?? "")} · AC date: ${esc(compliance.acknowledgement_certificate_date ?? "")}</div>
  <div class="provider"><strong>Software provider</strong><br />${esc(provider.name ?? "")}<br />${esc(provider.address ?? "")}<br />TIN: ${esc(provider.tin ?? "")}<br />${esc(provider.accreditation_details ?? "")}</div>
  </footer>`
      : `<footer>${esc(terms ?? doc.terms ?? business?.invoice_terms ?? "")}</footer>`
  }
  <script>window.onload=()=>{window.print()}</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
  return true;
}
