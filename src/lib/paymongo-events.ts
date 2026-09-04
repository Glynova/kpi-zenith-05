/**
 * Pure mapping between PayMongo webhook event types and Daraven billing state.
 * Kept separate from the route handler so the lifecycle is unit-testable.
 */

/** PayMongo subscription event -> Daraven subscription status. */
export const SUBSCRIPTION_STATUS_MAP: Record<string, string> = {
  "subscription.activated": "active",
  "subscription.active": "active",
  "subscription.updated": "active",
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

/**
 * Failed payment escalation. First failure -> past_due (grace period, full
 * access with a warning). A further failure while already past_due/unpaid ->
 * unpaid (read-only). Tenant data is never touched.
 */
export function nextStatusAfterFailure(current: string | null | undefined): "past_due" | "unpaid" {
  return current === "past_due" || current === "unpaid" ? "unpaid" : "past_due";
}

export function toIso(value: unknown): string | undefined {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string" && value) return value;
  return undefined;
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
  const eventPeriod = toIso(attrs["period_start"] ?? attrs["current_period_start"]);
  if (eventPeriod) return `period:${eventPeriod}`;
  return null;
}
