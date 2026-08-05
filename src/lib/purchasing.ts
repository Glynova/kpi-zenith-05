/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared contract for the purchasing engine.
 *
 * The golden rule mirrored everywhere in the UI: a purchase order never moves
 * stock. Only a CONFIRMED goods receipt writes inventory movements, and that
 * happens inside the database (confirm_goods_receipt) so costing, batches,
 * payables and price history stay in one atomic step.
 */
import { db, type Row } from "@/lib/db";

export const SUPPLIER_TYPES = [
  "manufacturer",
  "distributor",
  "wholesaler",
  "retailer",
  "service_provider",
  "local_supplier",
  "international_supplier",
  "other",
];

export const SUPPLIER_STATUSES = ["active", "inactive", "blocked"];

export const PAYMENT_TERMS: { value: string; label: string; days: number }[] = [
  { value: "cash", label: "Cash", days: 0 },
  { value: "due_on_receipt", label: "Due on receipt", days: 0 },
  { value: "net_7", label: "7 days", days: 7 },
  { value: "net_15", label: "15 days", days: 15 },
  { value: "net_30", label: "30 days", days: 30 },
  { value: "net_45", label: "45 days", days: 45 },
  { value: "net_60", label: "60 days", days: 60 },
  { value: "custom", label: "Custom", days: 0 },
];

export const PAYMENT_TERMS_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_TERMS.map((t) => [t.value, t.label]),
);

export function termsDays(terms?: string | null) {
  return PAYMENT_TERMS.find((t) => t.value === terms)?.days ?? 0;
}

export const PO_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "partially_received",
  "received",
  "closed",
  "cancelled",
];

/** Valid next states — invalid transitions are never offered nor allowed. */
export const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "approved", "cancelled"],
  pending_approval: ["approved", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["cancelled"],
  ordered: ["cancelled"],
  partially_received: ["cancelled"],
  received: ["closed"],
  closed: [],
  cancelled: [],
};

/** Receiving is only possible once the order is live and not finished. */
export const RECEIVABLE_STATUSES = ["approved", "sent", "ordered", "partially_received"];

export const PR_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "converted",
  "cancelled",
];

export const LANDED_COST_METHODS = [
  { value: "none", label: "Do not allocate" },
  { value: "quantity", label: "By quantity" },
  { value: "value", label: "By product value" },
  { value: "manual", label: "Manual" },
];

export const RETURN_REASONS = [
  "Damaged on arrival",
  "Wrong item",
  "Expired",
  "Quality issue",
  "Over-delivered",
  "Other",
];

/** Money helper — keeps two-decimal precision out of float drift. */
export function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Line total = qty x unit cost - discount + tax. */
export function poLineTotal(line: {
  quantity: number;
  unit_cost: number;
  discount?: number;
  tax?: number;
}) {
  return round2(
    Number(line.quantity || 0) * Number(line.unit_cost || 0) -
      Number(line.discount || 0) +
      Number(line.tax || 0),
  );
}

/** Percentage change against the previous purchase price. */
export function priceVariance(current: number, previous?: number | null) {
  const prev = Number(previous ?? 0);
  if (!prev) return null;
  return ((Number(current || 0) - prev) / prev) * 100;
}

/** Default warning threshold for purchase price jumps (percent). */
export const DEFAULT_PRICE_ALERT_PERCENT = 10;

/** Recommended order = maximum stock - available stock (never negative). */
export function recommendedOrderQty(product: Row, available: number) {
  const max = Number(product.max_stock ?? 0);
  const reorder = Number(product.reorder_level ?? product.min_stock ?? 0);
  const target = max > 0 ? max : reorder * 2;
  return Math.max(0, Math.ceil(target - available));
}

/** Next document number from the database sequence (unique per business). */
export async function nextDocNumber(businessId: string, prefix: string): Promise<string> {
  const { data, error } = await db.rpc("next_doc_number", {
    _business_id: businessId,
    _prefix: prefix,
  });
  if (error) throw error;
  return data as string;
}

export type MatchResult = { status: string; notes: string[] };

/** Three-way match: purchase order vs goods receipt vs supplier invoice. */
export function threeWayMatch(input: {
  orderedQty: number;
  orderedTotal: number;
  receivedQty: number;
  invoicedQty: number;
  invoicedTotal: number;
}): MatchResult {
  const notes: string[] = [];
  if (round2(input.invoicedQty) !== round2(input.receivedQty)) {
    notes.push(
      `Quantity variance — received ${input.receivedQty}, invoiced ${input.invoicedQty}.`,
    );
  }
  const expected = round2(
    input.orderedQty > 0 ? (input.orderedTotal / input.orderedQty) * input.invoicedQty : 0,
  );
  if (Math.abs(round2(input.invoicedTotal) - expected) > 0.01) {
    notes.push(`Price variance — expected ${expected.toFixed(2)}, invoiced ${round2(input.invoicedTotal).toFixed(2)}.`);
  }
  const qtyOff = notes.some((n) => n.startsWith("Quantity"));
  const priceOff = notes.some((n) => n.startsWith("Price"));
  const status = qtyOff && priceOff ? "variance" : qtyOff ? "quantity_variance" : priceOff ? "price_variance" : "matched";
  return { status, notes };
}

export const MATCH_LABEL: Record<string, string> = {
  pending: "Pending",
  matched: "Matched",
  price_variance: "Price variance",
  quantity_variance: "Quantity variance",
  variance: "Price + quantity variance",
};

/** Expiry buckets used across receiving and batch screens. */
export function expiryState(expiry?: string | null, warnDays = 30) {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { tone: "expired" as const, label: "Expired", days };
  if (days <= warnDays) return { tone: "soon" as const, label: `Expires in ${days}d`, days };
  return { tone: "valid" as const, label: "Valid", days };
}

/** Supplier scorecard from raw orders / receipts. */
export function supplierPerformance(orders: Row[], receipts: Row[], receiptItems: Row[]) {
  const delivered = receipts.filter((r) => r.status === "confirmed");
  let onTime = 0;
  let leadSum = 0;
  let leadCount = 0;
  for (const r of delivered) {
    const po = orders.find((o) => o.id === r.purchase_order_id);
    if (po?.expected_date && new Date(r.receipt_date) <= new Date(po.expected_date)) onTime++;
    if (po?.order_date) {
      const days = (new Date(r.receipt_date).getTime() - new Date(po.order_date).getTime()) / 86_400_000;
      if (days >= 0) {
        leadSum += days;
        leadCount++;
      }
    }
  }
  const ordered = receiptItems.reduce((s, i) => s + Number(i.ordered_quantity ?? 0), 0);
  const accepted = receiptItems.reduce((s, i) => s + Number(i.accepted_quantity ?? 0), 0);
  const damaged = receiptItems.reduce((s, i) => s + Number(i.damaged_quantity ?? 0), 0);
  const rejected = receiptItems.reduce((s, i) => s + Number(i.rejected_quantity ?? 0), 0);
  const received = receiptItems.reduce((s, i) => s + Number(i.received_quantity ?? 0), 0);
  return {
    orders: orders.length,
    deliveries: delivered.length,
    onTimePercent: delivered.length ? (onTime / delivered.length) * 100 : null,
    fillRate: ordered ? (accepted / ordered) * 100 : null,
    avgLeadTime: leadCount ? leadSum / leadCount : null,
    damagedPercent: received ? (damaged / received) * 100 : null,
    rejectedPercent: received ? (rejected / received) * 100 : null,
    purchaseValue: orders.reduce((s, o) => s + Number(o.total ?? 0), 0),
  };
}
