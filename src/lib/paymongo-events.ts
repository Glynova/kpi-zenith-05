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
