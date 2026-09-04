/**
 * Pure mapping between PayMongo webhook events / resource states and Daraven
 * billing state. Kept separate from the route handler and server modules so
 * the lifecycle is unit-testable without a database or network.
 */

/** Statuses a Daraven subscription row can hold. */
export type DaravenSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "suspended"
  | "incomplete"
  | "incomplete_expired";

/** PayMongo subscription resource status -> Daraven subscription status. */
export const PROVIDER_STATUS_MAP: Record<string, DaravenSubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  past_due: "past_due",
  unpaid: "unpaid",
  cancelled: "cancelled",
  canceled: "cancelled",
  paused: "suspended",
};

/**
 * PayMongo subscription event -> Daraven subscription status for events whose
 * type alone determines the state. `subscription.updated` is deliberately not
 * listed: its meaning comes from the payload's `status` attribute.
 */
export const SUBSCRIPTION_STATUS_MAP: Record<string, DaravenSubscriptionStatus> = {
  "subscription.activated": "active",
  "subscription.active": "active",
  "subscription.resumed": "active",
  "subscription.cancelled": "cancelled",
  "subscription.canceled": "cancelled",
  "subscription.past_due": "past_due",
  "subscription.unpaid": "unpaid",
  "subscription.incomplete": "incomplete",
  "subscription.paused": "suspended",
};

/** PayMongo subscription invoice event -> billing_invoices.status. */
export const INVOICE_STATUS_MAP: Record<string, string> = {
  "subscription.invoice.created": "open",
  "subscription.invoice.finalized": "open",
  "subscription.invoice.upcoming": "draft",
  "subscription.invoice.paid": "paid",
  "subscription.invoice.payment_failed": "payment_failed",
  "subscription.invoice.voided": "void",
};

/** PayMongo invoice resource status -> billing_invoices.status. */
export const PROVIDER_INVOICE_STATUS_MAP: Record<string, string> = {
  draft: "draft",
  open: "open",
  finalized: "open",
  paid: "paid",
  payment_failed: "payment_failed",
  failed: "payment_failed",
  void: "void",
  voided: "void",
  uncollectible: "uncollectible",
};

/**
 * Decide which Daraven status a subscription event implies.
 * Definite event types win; `subscription.updated` and unknown events read the
 * payload. Returns null when nothing can be inferred (caller should ignore).
 */
export function resolveSubscriptionStatus(
  eventType: string,
  attrs: Record<string, unknown>,
): DaravenSubscriptionStatus | null {
  const fromPayload = PROVIDER_STATUS_MAP[String(attrs["status"] ?? "")] ?? null;
  if (eventType === "subscription.updated") return fromPayload;
  return SUBSCRIPTION_STATUS_MAP[eventType] ?? fromPayload;
}

/**
 * Failed payment escalation. First failure -> past_due (grace period, full
 * access with a warning). A further failure while already past_due/unpaid ->
 * unpaid (read-only). Tenant data is never touched.
 */
export function nextStatusAfterFailure(current: string | null | undefined): "past_due" | "unpaid" {
  return current === "past_due" || current === "unpaid" ? "unpaid" : "past_due";
}

export function toIso(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    // PayMongo sends unix seconds; tolerate milliseconds too.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

/** Centavos -> PHP. */
export function fromCentavos(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value) / 100;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Math.round(Number(value)) / 100;
  return undefined;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string")
    return (value as { id: string }).id;
  return null;
}

/**
 * Locate the PayMongo subscription id referenced by an event.
 *  - subscription.* events: the resource itself
 *  - subscription.invoice.* events: `resource_id` (PayMongo's field), with
 *    fallbacks for `subscription_id` / nested `subscription`
 */
export function extractSubscriptionRef(
  eventType: string,
  resource: { id?: string; attributes?: Record<string, unknown> } | null | undefined,
): string | null {
  const attrs = resource?.attributes ?? {};
  if (eventType.startsWith("subscription.") && !eventType.startsWith("subscription.invoice"))
    return resource?.id ?? null;
  return (
    idOf(attrs["resource_id"]) ??
    idOf(attrs["subscription_id"]) ??
    idOf(attrs["subscription"]) ??
    null
  );
}

/** Locate the invoice id referenced by an event (invoice events or PI metadata). */
export function extractInvoiceRef(
  eventType: string,
  resource: { id?: string; attributes?: Record<string, unknown> } | null | undefined,
): string | null {
  const attrs = resource?.attributes ?? {};
  if (eventType.startsWith("subscription.invoice.")) return resource?.id ?? null;
  return idOf(attrs["invoice_id"]) ?? idOf(attrs["invoice"]) ?? null;
}

/** Locate the payment intent id referenced by an event/resource. */
export function extractPaymentIntentRef(
  resource: { id?: string; type?: string; attributes?: Record<string, unknown> } | null | undefined,
): string | null {
  const attrs = resource?.attributes ?? {};
  if (resource?.type === "payment_intent") return resource.id ?? null;
  return idOf(attrs["payment_intent_id"]) ?? idOf(attrs["payment_intent"]) ?? null;
}

/**
 * Deterministic identity for one paid billing cycle of a subscription.
 *
 * Both `subscription.invoice.paid` and `payment.paid` for the same cycle must
 * resolve to the same key so the commission ledger's partial unique index
 * (subscription_id, cycle_key) collapses them into a single earning. Preference
 * order is stable and time-independent:
 *   1. the subscription's current period start (unchanged within a cycle)
 *   2. the provider invoice id, when the period is unknown
 *   3. the period start carried on the event payload
 */
export function cycleKeyFor(
  sub: { id: string; current_period_start?: string | null } | null | undefined,
  attrs: Record<string, unknown>,
  invoiceId?: string | null,
): string | null {
  if (!sub) return null;
  const periodStart = toIso(sub.current_period_start ?? undefined);
  if (periodStart) return `period:${periodStart}`;
  if (invoiceId) return `invoice:${invoiceId}`;
  const eventPeriod = toIso(
    attrs["period_start"] ?? attrs["billing_cycle_start"] ?? attrs["current_period_start"],
  );
  if (eventPeriod) return `period:${eventPeriod}`;
  return null;
}

export type CheckoutStatus =
  | "pending"
  | "awaiting_action"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled"
  | "superseded";

/** Payment intent status -> checkout status. */
export function checkoutStatusFromIntent(
  intentStatus: string | null | undefined,
  lastError: unknown,
): CheckoutStatus {
  switch (intentStatus) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    case "awaiting_next_action":
      return "awaiting_action";
    case "awaiting_payment_method":
      return lastError ? "failed" : "pending";
    default:
      return "pending";
  }
}

/** Human-readable reason for a PayMongo payment failure code. */
export function describeFailure(code: string | null | undefined, message?: string | null) {
  const table: Record<string, string> = {
    card_expired: "The card has expired.",
    cvc_invalid: "The card's security code was rejected.",
    generic_decline: "The card was declined by the issuing bank.",
    fraudulent: "The payment was flagged as potentially fraudulent by the bank.",
    insufficient_funds: "The card has insufficient funds.",
    processor_blocked: "The payment was blocked by the card processor.",
    lost_card: "The card was reported lost.",
    stolen_card: "The card was reported stolen.",
    processor_unavailable: "The card processor is temporarily unavailable. Please retry.",
    blocked: "The payment was blocked. Please use a different card.",
    payment_method_not_allowed: "This payment method is not allowed for recurring billing.",
    authentication_failed: "3-D Secure authentication failed or was cancelled.",
  };
  if (code && table[code]) return table[code];
  if (message) return message;
  return "The payment could not be completed. Please try another payment method.";
}
