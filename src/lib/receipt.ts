/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row } from "@/lib/db";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { resolveImageSrc } from "@/lib/storage-images";
import { logDocumentEvent, logPrintEvent } from "@/lib/audit";
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
  reprint?: boolean;
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
    reprint = false,
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
  const businessId = String(sale.business_id ?? business?.id ?? "");
  let compliance: Row = {};
  let provider: Row = {};
  let wasReprint = reprint;
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
    if (autoPrint) {
      const recordId = String(sale.sale_number ?? sale.id);
      if (reprint) {
        await logDocumentEvent(businessId, "REPRINT", "sales", recordId, {
          user_agent: navigator.userAgent,
        });
      } else {
        wasReprint =
          (await logPrintEvent(businessId, "sales", recordId, {
            user_agent: navigator.userAgent,
          })) === "REPRINT";
      }
    }
  }
  const documentTitle = String(compliance.invoice_title ?? "SALES INVOICE");
  const branchTin = [compliance.tin, compliance.tin_branch_code].filter(Boolean).join("-");
  const isPH = compliance.jurisdiction === "PH";
  const vatStatusLine = !isPH
    ? ""
    : compliance.vat_registration_type === "vat"
      ? `VAT REG TIN: ${branchTin}`
      : compliance.vat_registration_type === "vat_exempt"
        ? `VAT-EXEMPT BUSINESS · TIN: ${branchTin}`
        : `NON-VAT REG TIN: ${branchTin}`;

  const esc = (v: any) =>
    String(v ?? "").replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );
  const money = (n: number) => esc(formatCurrency(Number(n ?? 0), currency));

  const tendered = payments.reduce((s, p) => s + Number(p.tendered ?? p.amount ?? 0), 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const change = Math.max(tendered - paid, 0);
  const regularDiscount = Math.max(
    Number(sale.discount ?? 0) - Number(sale.statutory_discount_amount ?? 0),
    0,
  );

  const lines = items
    .map(
      (i) =>
        `<tr><td>${esc(i.product_name)}${
          i.variant_name ? `<div class="muted">${esc(i.variant_name)}</div>` : ""
        }<div class="muted">${esc(Number(i.quantity))} × ${money(i.unit_price)}${
          Number(i.discount) > 0 ? ` − ${money(i.discount)}` : ""
        }</div><div class="muted">${esc(i.tax_type ?? "")}</div></td><td class="num">${money(i.total)}</td></tr>`,
    )
    .join("");

  const payRows = payments
    .map(
      (p) =>
        `<div><span>${esc(String(p.method).replace(/_/g, " "))}</span><span>${money(p.amount)}</span></div>`,
    )
    .join("");
  const taxRow =
    options.showTaxDetails || isPH
      ? `<div><span>${esc(taxName)}</span><span>${money(sale.tax)}</span></div>${
          isPH
            ? `<div><span>VATable sales</span><span>${money(sale.vatable_amount)}</span></div>
             <div><span>VAT-exempt sales</span><span>${money(sale.vat_exempt_amount)}</span></div>
             <div><span>Zero-rated sales</span><span>${money(sale.zero_rated_amount)}</span></div>
             <div><span>VAT amount</span><span>${money(sale.vat_amount)}</span></div>`
            : ""
        }`
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
    .preview-watermark{position:fixed;inset:40% 0 auto;text-align:center;transform:rotate(-25deg);font-size:38pt;font-weight:900;letter-spacing:8px;color:rgba(180,0,0,.18);pointer-events:none}
    .reprint{font-weight:900;text-align:center;letter-spacing:.2em;color:#b91c1c;margin-bottom:8px}
  </style></head><body>
  ${autoPrint ? "" : '<div class="preview-watermark">PREVIEW</div>'}
  ${wasReprint ? '<div class="reprint">REPRINT</div>' : ""}
  ${logoSrc ? `<img src="${esc(logoSrc)}" alt="Business logo" style="display:block;max-width:100%;max-height:22mm;margin:0 auto 8px;object-fit:contain" />` : ""}
  <h1>${esc(compliance.legal_name ?? business?.name ?? "Receipt")}</h1>
  ${compliance.trade_name ? `<div class="center">${esc(compliance.trade_name)}</div>` : ""}
  ${isPH ? `<div class="center muted">${esc(vatStatusLine)}</div>` : ""}
  <div class="center muted">${esc(compliance.business_address ?? business?.address ?? "")}</div>
  <div class="center muted">${esc(business?.phone ?? "")} ${esc(business?.email ?? "")}</div>
  <hr />
  <h1>${esc(documentTitle)}</h1>
  <div class="muted">${esc(documentTitle)} no.: ${esc(sale.sale_number)}</div>
  <div class="muted">Date and time: ${esc(new Date(sale.created_at ?? Date.now()).toLocaleString())}</div>
  ${cashier ? `<div class="muted">Cashier: ${esc(cashier)}</div>` : ""}
  <div class="muted">Buyer: ${esc(sale.statutory_buyer_name ?? customer?.name ?? "Walk-in")}</div>
  ${customer?.address ? `<div class="muted">Address: ${esc(customer.address)}</div>` : ""}
  ${(sale.statutory_buyer_tin ?? customer?.tax_id) ? `<div class="muted">TIN: ${esc(sale.statutory_buyer_tin ?? customer?.tax_id)}</div>` : ""}
  ${sale.statutory_buyer_id ? `<div class="muted">ID: ${esc(sale.statutory_buyer_id)}</div>` : ""}
  <hr />
  <table>${lines}</table>
  <hr />
  <div class="tot">
    <div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
    <div><span>Discount</span><span>-${money(regularDiscount)}</span></div>
    ${Number(sale.statutory_discount_amount ?? 0) > 0 ? `<div><span>${esc(String(sale.statutory_discount_type ?? "Statutory discount").replace(/_/g, " "))}</span><span>-${money(sale.statutory_discount_amount)}</span></div>` : ""}
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
  <div class="muted">POS accreditation no.: ${esc(compliance.pos_accreditation_no ?? "")} · PTU no.: ${esc(compliance.pos_ptu_no ?? "")} · MIN: ${esc(compliance.machine_id_no ?? "")}</div>
  <div class="muted">AC no.: ${esc(compliance.acknowledgement_certificate_no ?? "")} · AC date: ${esc(compliance.acknowledgement_certificate_date ?? "")}</div>
  <div class="muted"><strong>Software provider</strong> · ${esc(provider.name ?? "")} · ${esc(provider.address ?? "")} · TIN ${esc(provider.tin ?? "")} · ${esc(provider.accreditation_details ?? "")}</div>
  ${footer}
  ${autoPrint ? "<script>window.onload=()=>{window.print()}</script>" : ""}
  </body></html>`;

  win.document.write(html);
  win.document.close();
  return true;
}
