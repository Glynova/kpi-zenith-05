import type { ChosenAddon } from "@/lib/addons";
/**
 * Universal sales engine.
 *
 * Pure calculation helpers live at the top (no I/O, easy to reason about), and
 * the service layer below wraps the database engine functions. The database is
 * always the authority: `complete_sale()` and `post_sales_return()` are the only
 * paths that touch inventory, so the UI never invents stock or cost maths.
 */
import { db, type Row } from "@/lib/db";

export const DOCUMENT_TYPES = ["quote", "sales_order", "pos_sale", "sale", "return"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOC_PREFIX: Record<DocumentType, string> = {
  quote: "QT",
  sales_order: "SO",
  pos_sale: "SALE",
  sale: "SALE",
  return: "RET",
};

export const DOC_LABEL: Record<DocumentType, string> = {
  quote: "Quote",
  sales_order: "Sales Order",
  pos_sale: "POS Sale",
  sale: "Sale",
  return: "Sales Return",
};

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
  "cancelled",
];

export const ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "confirmed",
  "partially_fulfilled",
  "fulfilled",
  "cancelled",
  "closed",
];

export const PAYMENT_STATUSES = [
  "unpaid",
  "partially_paid",
  "paid",
  "refunded",
  "partially_refunded",
  "voided",
];

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "digital_wallet",
  "credit",
  "other",
];
export const SALES_CHANNELS = [
  "pos",
  "online",
  "website",
  "marketplace",
  "phone",
  "manual",
  "wholesale",
  "other",
];
export const SALES_SOURCES = ["pos", "website", "mobile_app", "marketplace", "api", "manual"];
export const CUSTOMER_TYPES = [
  "walk_in",
  "individual",
  "business",
  "wholesale",
  "corporate",
  "online",
  "other",
];
export const PRICE_TIERS = ["default", "wholesale", "vip", "corporate"];
export const RETURN_CONDITIONS = ["resellable", "damaged", "defective", "expired", "other"];
export const DELIVERY_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];
export const CUSTOMER_STATUSES = [
  "order_received",
  "processing",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];
export const INVENTORY_TIMINGS = [
  {
    value: "sale_completed",
    label: "When the sale is completed",
    hint: "Best for POS and counter sales.",
  },
  {
    value: "payment_completed",
    label: "When payment is completed",
    hint: "Stock leaves once the money is in.",
  },
  {
    value: "fulfillment",
    label: "When the order is fulfilled",
    hint: "Best for e-commerce and wholesale.",
  },
];

/** Which order statuses may follow the current one. */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "confirmed", "cancelled"],
  pending_approval: ["confirmed", "draft", "cancelled"],
  confirmed: ["partially_fulfilled", "fulfilled", "cancelled"],
  partially_fulfilled: ["fulfilled", "cancelled"],
  fulfilled: ["closed"],
  cancelled: [],
  closed: [],
};

export const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "rejected", "expired", "cancelled"],
  accepted: ["converted", "cancelled"],
  rejected: [],
  expired: [],
  converted: [],
  cancelled: [],
};

export function canTransition(doc: DocumentType, from: string, to: string) {
  const map = doc === "quote" ? QUOTE_TRANSITIONS : ORDER_TRANSITIONS;
  return (map[from] ?? []).includes(to);
}

/* ------------------------------------------------------------------ maths */

export function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type CartLine = {
  key: string;
  product_id: string;
  variant_id?: string | null;
  product_name: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost?: number;
  discount: number;
  discount_type?: "amount" | "percent";
  tax_rate: number;
  notes?: string | null;
  condition?: string | null;
  available?: number;
  addons?: ChosenAddon[];
};

export type LineTotals = {
  gross: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
};

/** Line maths. Handles percentage/fixed discounts and inclusive/exclusive tax. */
export function lineTotals(line: CartLine, taxInclusive: boolean): LineTotals {
  const gross = round2(Number(line.quantity || 0) * Number(line.unit_price || 0));
  const raw = Number(line.discount || 0);
  const discount = round2(
    line.discount_type === "percent"
      ? (gross * Math.min(Math.max(raw, 0), 100)) / 100
      : Math.min(Math.max(raw, 0), gross),
  );
  const after = round2(gross - discount);
  const rate = Number(line.tax_rate || 0) / 100;
  if (taxInclusive) {
    const net = round2(after / (1 + rate));
    return { gross, discount, net, tax: round2(after - net), total: after };
  }
  const tax = round2(after * rate);
  return { gross, discount, net: after, tax, total: round2(after + tax) };
}

export type OrderTotals = {
  subtotal: number;
  itemDiscount: number;
  orderDiscount: number;
  discount: number;
  tax: number;
  shipping: number;
  otherCharges: number;
  total: number;
  cost: number;
};

export function orderTotals(
  lines: CartLine[],
  opts: {
    taxInclusive?: boolean;
    orderDiscount?: number;
    orderDiscountType?: "amount" | "percent";
    shipping?: number;
    otherCharges?: number;
  } = {},
): OrderTotals {
  const inclusive = !!opts.taxInclusive;
  let subtotal = 0;
  let itemDiscount = 0;
  let tax = 0;
  let cost = 0;
  for (const l of lines) {
    const t = lineTotals(l, inclusive);
    subtotal += t.net;
    itemDiscount += t.discount;
    tax += t.tax;
    cost += Number(l.unit_cost || 0) * Number(l.quantity || 0);
  }
  subtotal = round2(subtotal);
  const rawOrder = Number(opts.orderDiscount || 0);
  const orderDiscount = round2(
    opts.orderDiscountType === "percent"
      ? (subtotal * Math.min(Math.max(rawOrder, 0), 100)) / 100
      : Math.min(Math.max(rawOrder, 0), subtotal),
  );
  // Tax scales with the discounted net so an order discount never creates tax
  // on money the customer did not pay.
  const scale = subtotal > 0 ? (subtotal - orderDiscount) / subtotal : 1;
  const scaledTax = round2(tax * scale);
  const shipping = round2(Number(opts.shipping || 0));
  const otherCharges = round2(Number(opts.otherCharges || 0));
  return {
    subtotal,
    itemDiscount: round2(itemDiscount),
    orderDiscount,
    discount: round2(itemDiscount + orderDiscount),
    tax: scaledTax,
    shipping,
    otherCharges,
    total: Math.max(0, round2(subtotal - orderDiscount + scaledTax + shipping + otherCharges)),
    cost: round2(cost),
  };
}

export function paymentStatusFor(total: number, paid: number, refunded = 0) {
  if (refunded > 0 && paid <= 0.009) return "refunded";
  if (refunded > 0) return "partially_refunded";
  if (paid <= 0.009) return "unpaid";
  if (paid + 0.009 >= total) return "paid";
  return "partially_paid";
}

export function grossProfit(revenue: number, cogs: number) {
  const profit = round2(Number(revenue || 0) - Number(cogs || 0));
  const margin = Number(revenue || 0) > 0 ? (profit / Number(revenue)) * 100 : 0;
  return { revenue: round2(Number(revenue || 0)), cogs: round2(Number(cogs || 0)), profit, margin };
}

export function availableCredit(customer: Row | null | undefined) {
  const limit = Number(customer?.credit_limit ?? 0);
  const balance = Number(customer?.balance ?? 0);
  return { limit, balance, available: Math.max(round2(limit - balance), 0) };
}

/**
 * Price priority: customer-specific -> customer tier -> product/variant price.
 */
export function resolvePrice(
  product: Row,
  variant: Row | null | undefined,
  customer: Row | null | undefined,
  priceLists: Row[],
  quantity = 1,
): number {
  const matches = priceLists.filter(
    (p) =>
      p.product_id === product.id &&
      (p.variant_id ?? null) === (variant?.id ?? null) &&
      Number(p.min_quantity ?? 0) <= quantity,
  );
  const specific = matches
    .filter((p) => customer?.id && p.customer_id === customer.id)
    .sort((a, b) => Number(b.min_quantity ?? 0) - Number(a.min_quantity ?? 0))[0];
  if (specific) return Number(specific.price);
  const tier =
    customer?.price_tier && customer.price_tier !== "default" ? customer.price_tier : null;
  if (tier) {
    const tiered = matches
      .filter((p) => !p.customer_id && p.tier === tier)
      .sort((a, b) => Number(b.min_quantity ?? 0) - Number(a.min_quantity ?? 0))[0];
    if (tiered) return Number(tiered.price);
  }
  return Number(variant?.selling_price ?? product.selling_price ?? 0);
}

export function stockLabel(available: number, reorder = 0) {
  if (available <= 0) return { label: "Out of stock", tone: "destructive" as const };
  if (reorder > 0 && available <= reorder)
    return { label: "Low stock", tone: "secondary" as const };
  return { label: "Available", tone: "outline" as const };
}

/* --------------------------------------------------------------- services */

export async function nextDocNumber(businessId: string, prefix: string) {
  const { data, error } = await db.rpc("next_doc_number", {
    _business_id: businessId,
    _prefix: prefix,
  });
  if (error) throw error;
  return data as string;
}

export type SaleDraft = {
  businessId: string;
  documentType: DocumentType;
  number?: string;
  customerId?: string | null;
  locationId?: string | null;
  registerId?: string | null;
  channel?: string;
  source?: string;
  currency?: string;
  exchangeRate?: number;
  taxInclusive?: boolean;
  saleDate?: string;
  dueDate?: string | null;
  expectedDate?: string | null;
  expiresOn?: string | null;
  paymentTerms?: string | null;
  salespersonId?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  status?: string;
  orderDiscount?: number;
  orderDiscountType?: "amount" | "percent";
  shipping?: number;
  otherCharges?: number;
  shippingAddress?: string | null;
  billingAddress?: string | null;
  shippingMethod?: string | null;
  quoteId?: string | null;
  salesOrderId?: string | null;
  originalSaleId?: string | null;
  returnReason?: string | null;
  createdBy?: string | null;
  lines: CartLine[];
};

/** Creates a sales document plus its items. Never touches inventory. */
export async function createSale(draft: SaleDraft) {
  const lines = draft.lines.filter((l) => l.product_id && Number(l.quantity) > 0);
  if (!lines.length) throw new Error("Add at least one item");

  const totals = orderTotals(lines, {
    taxInclusive: draft.taxInclusive,
    orderDiscount: draft.orderDiscount,
    orderDiscountType: draft.orderDiscountType,
    shipping: draft.shipping,
    otherCharges: draft.otherCharges,
  });

  const number =
    draft.number ?? (await nextDocNumber(draft.businessId, DOC_PREFIX[draft.documentType]));

  const { data: sale, error } = await db
    .from("sales")
    .insert({
      business_id: draft.businessId,
      document_type: draft.documentType,
      sale_number: number,
      customer_id: draft.customerId || null,
      location_id: draft.locationId || null,
      register_id: draft.registerId || null,
      channel: draft.channel ?? (draft.documentType === "pos_sale" ? "pos" : "manual"),
      source: draft.source ?? null,
      currency: draft.currency ?? null,
      exchange_rate: draft.exchangeRate ?? 1,
      tax_inclusive: !!draft.taxInclusive,
      sale_type: draft.documentType,
      status: draft.status ?? "draft",
      payment_method: draft.paymentMethod ?? "cash",
      payment_status: "unpaid",
      sale_date: draft.saleDate ?? new Date().toISOString().slice(0, 10),
      due_date: draft.dueDate ?? null,
      expected_date: draft.expectedDate ?? null,
      expires_on: draft.expiresOn ?? null,
      payment_terms: draft.paymentTerms ?? null,
      salesperson_id: draft.salespersonId ?? null,
      subtotal: totals.subtotal,
      discount: totals.discount,
      discount_type: draft.orderDiscountType ?? "amount",
      discount_value: draft.orderDiscount ?? 0,
      tax: totals.tax,
      shipping: totals.shipping,
      other_charges: totals.otherCharges,
      total: totals.total,
      paid: 0,
      cost_total: 0,
      base_total: round2(totals.total * (draft.exchangeRate || 1)),
      notes: draft.notes ?? null,
      shipping_address: draft.shippingAddress ?? null,
      billing_address: draft.billingAddress ?? null,
      shipping_method: draft.shippingMethod ?? null,
      delivery_status: draft.shippingMethod ? "pending" : null,
      quote_id: draft.quoteId ?? null,
      sales_order_id: draft.salesOrderId ?? null,
      original_sale_id: draft.originalSaleId ?? null,
      return_reason: draft.returnReason ?? null,
      created_by: draft.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;

  const inclusive = !!draft.taxInclusive;
  const { data: insertedItems, error: itemsError } = await db
    .from("sale_items")
    .insert(
      lines.map((l) => {
        const t = lineTotals(l, inclusive);
        return {
          business_id: draft.businessId,
          sale_id: sale.id,
          product_id: l.product_id,
          variant_id: l.variant_id || null,
          product_name: l.product_name,
          sku: l.sku ?? null,
          unit: l.unit ?? null,
          quantity: l.quantity,
          unit_price: l.unit_price,
          unit_cost: l.unit_cost ?? 0,
          discount: t.discount,
          discount_type: l.discount_type ?? "amount",
          tax_rate: l.tax_rate ?? 0,
          tax: t.tax,
          total: t.total,
          condition: l.condition ?? null,
          notes: l.notes ?? null,
        };
      }),
    )
    .select("id");
  if (itemsError) {
    await db.from("sales").delete().eq("id", sale.id);
    throw itemsError;
  }
  // Selected add-ons keep their price and cost at the time of sale.
  const addonRows = lines.flatMap((l, i) =>
    (l.addons ?? []).map((a) => ({
      business_id: draft.businessId,
      sale_item_id: (insertedItems as Row[])[i].id,
      option_id: a.option_id,
      group_name: a.group_name,
      option_name: a.option_name,
      extra_price: a.extra_price,
      extra_cost: a.extra_cost,
    })),
  );
  if (addonRows.length) {
    const { error } = await db.from("sale_item_addons").insert(addonRows);
    if (error) {
      await db.from("sales").delete().eq("id", sale.id);
      throw error;
    }
  }
  return sale as Row;
}

export async function recordPayment(input: {
  businessId: string;
  saleId: string;
  method: string;
  amount: number;
  tendered?: number | null;
  registerId?: string | null;
  reference?: string | null;
  isRefund?: boolean;
  createdBy?: string | null;
}) {
  if (!(Number(input.amount) > 0)) throw new Error("Payment amount must be greater than zero");
  const { error } = await db.from("sale_payments").insert({
    business_id: input.businessId,
    sale_id: input.saleId,
    register_id: input.registerId || null,
    method: input.method,
    amount: round2(input.amount),
    tendered: input.tendered ?? null,
    change_given: input.tendered ? Math.max(round2(input.tendered - input.amount), 0) : 0,
    is_refund: !!input.isRefund,
    reference: input.reference ?? null,
    created_by: input.createdBy ?? null,
  });
  if (error) throw error;
}

/** Posts inventory, COGS, receivables and cash for a sale. Idempotent server-side. */
export async function completeSale(saleId: string) {
  const { error } = await db.rpc("complete_sale", { _sale_id: saleId });
  if (error) throw error;
}

export async function postSalesReturn(returnId: string) {
  const { error } = await db.rpc("post_sales_return", { _return_id: returnId });
  if (error) throw error;
}

export async function closeRegister(registerId: string, actual: number, reason: string) {
  const { data, error } = await db.rpc("close_register", {
    _register_id: registerId,
    _actual: actual,
    _reason: reason || null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function reserveInventory(input: {
  businessId: string;
  saleId: string;
  locationId?: string | null;
  lines: CartLine[];
  createdBy?: string | null;
}) {
  const rows = input.lines
    .filter((l) => l.product_id && Number(l.quantity) > 0)
    .map((l) => ({
      business_id: input.businessId,
      product_id: l.product_id,
      variant_id: l.variant_id || null,
      warehouse_id: input.locationId || null,
      sale_id: input.saleId,
      quantity: l.quantity,
      status: "active",
      created_by: input.createdBy ?? null,
    }));
  if (!rows.length) return;
  const { error } = await db.from("inventory_reservations").insert(rows);
  if (error) throw error;
}

export async function releaseReservation(saleId: string) {
  const { error } = await db
    .from("inventory_reservations")
    .update({ status: "released" })
    .eq("sale_id", saleId)
    .eq("status", "active");
  if (error) throw error;
}

/** On-hand and reserved quantities for a location (or company-wide). */
export async function fetchAvailability(businessId: string, locationId?: string | null) {
  let query = db
    .from("inventory_balances")
    .select("product_id, variant_id, warehouse_id, quantity, average_cost")
    .eq("business_id", businessId);
  if (locationId) query = query.eq("warehouse_id", locationId);
  const [{ data: balances }, { data: reservations }] = await Promise.all([
    query,
    db
      .from("inventory_reservations")
      .select("product_id, variant_id, warehouse_id, quantity")
      .eq("business_id", businessId)
      .eq("status", "active"),
  ]);

  const key = (p: string, v?: string | null) => `${p}::${v ?? ""}`;
  const map = new Map<string, { onHand: number; reserved: number; cost: number }>();
  for (const b of (balances ?? []) as Row[]) {
    const k = key(b.product_id, b.variant_id);
    const cur = map.get(k) ?? { onHand: 0, reserved: 0, cost: 0 };
    cur.onHand += Number(b.quantity ?? 0);
    cur.cost = Number(b.average_cost ?? cur.cost);
    map.set(k, cur);
  }
  for (const r of (reservations ?? []) as Row[]) {
    if (locationId && r.warehouse_id && r.warehouse_id !== locationId) continue;
    const k = key(r.product_id, r.variant_id);
    const cur = map.get(k) ?? { onHand: 0, reserved: 0, cost: 0 };
    cur.reserved += Number(r.quantity ?? 0);
    map.set(k, cur);
  }
  return {
    key,
    get(productId: string, variantId?: string | null) {
      const v = map.get(key(productId, variantId)) ?? { onHand: 0, reserved: 0, cost: 0 };
      return { ...v, available: round2(v.onHand - v.reserved) };
    },
  };
}

/** Converts an accepted quote into a sales order without duplicating items. */
export async function convertQuoteToOrder(quote: Row, items: Row[], createdBy?: string | null) {
  const lines: CartLine[] = items.map((i, idx) => ({
    key: `${i.id ?? idx}`,
    product_id: i.product_id,
    variant_id: i.variant_id,
    product_name: i.product_name,
    sku: i.sku,
    unit: i.unit,
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    unit_cost: Number(i.unit_cost ?? 0),
    discount: Number(i.discount ?? 0),
    discount_type: "amount",
    tax_rate: Number(i.tax_rate ?? 0),
  }));
  const order = await createSale({
    businessId: quote.business_id,
    documentType: "sales_order",
    customerId: quote.customer_id,
    locationId: quote.location_id,
    channel: quote.channel,
    currency: quote.currency,
    exchangeRate: Number(quote.exchange_rate ?? 1),
    taxInclusive: !!quote.tax_inclusive,
    paymentTerms: quote.payment_terms,
    notes: quote.notes,
    status: "confirmed",
    quoteId: quote.id,
    shipping: Number(quote.shipping ?? 0),
    otherCharges: Number(quote.other_charges ?? 0),
    createdBy: createdBy ?? null,
    lines,
  });
  await db.from("sales").update({ status: "converted" }).eq("id", quote.id);
  return order;
}
