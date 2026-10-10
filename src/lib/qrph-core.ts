/**
 * Pure QR Ph helpers (no I/O) shared by the plan checkout, webhook and tests.
 * QR Ph is a one-time payment: every renewal creates a new checkout + QR.
 */

/** Convert pesos to integer centavos, rejecting invalid / negative amounts. */
export function toCentavos(pesos: number | string): number {
  const n = typeof pesos === "string" ? Number(pesos) : pesos;
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

/** PayMongo QR Ph minimum is ₱1.00 (100 centavos). */
export const QRPH_MIN_CENTAVOS = 100;

/** Extract the QR image (data URL or https) from an attach-payment-intent response. */
export function extractQrImage(attachResponse: unknown): string | null {
  const a = (attachResponse as any)?.data?.attributes;
  const img = a?.next_action?.code?.image_url;
  if (typeof img !== "string" || !img) return null;
  if (!img.startsWith("data:image/") && !img.startsWith("https://")) return null;
  return img;
}

/** Turn a PayMongo / unknown error into a short message safe to show users. */
export function sanitizePayMongoError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const cleaned = raw
    .replace(/(sk|pk)_(live|test)_[A-Za-z0-9]+/g, "[key]")
    .replace(/whsk_[A-Za-z0-9]+/g, "[secret]")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, "[auth]")
    .slice(0, 200)
    .trim();
  return cleaned || "Payment provider error. Please try again.";
}

export type CheckoutForEvent = {
  id: string;
  business_id: string;
  status: string;
  currency: string;
  amount_centavos: number | null;
  test_mode: boolean;
  payment_method_type: string | null;
  paymongo_payment_intent_id: string | null;
};

export type PaidEventDecision =
  | { action: "activate" }
  | { action: "ignore"; reason: string }
  | { action: "reject"; reason: string };

/**
 * Decide whether a verified `payment.paid` event may activate a plan checkout.
 * Every field must match the server-side checkout row; anything else is ignored.
 */
export function decidePaidEvent(
  event: {
    signatureMode: "test" | "live";
    intentId: string | null;
    amount: unknown;
    currency: unknown;
    status: unknown;
    livemode?: unknown;
    metadata?: Record<string, unknown> | null;
  },
  checkout: CheckoutForEvent | null,
): PaidEventDecision {
  if (!checkout) return { action: "ignore", reason: "unknown_checkout" };
  if (checkout.payment_method_type !== "qrph") return { action: "ignore", reason: "not_qrph" };
  if (checkout.status === "succeeded") return { action: "ignore", reason: "duplicate" };
  if (!["pending", "awaiting_action", "processing"].includes(checkout.status))
    return { action: "ignore", reason: `checkout_${checkout.status}` };
  if (!event.intentId || event.intentId !== checkout.paymongo_payment_intent_id)
    return { action: "reject", reason: "intent_mismatch" };
  if (event.status !== "paid") return { action: "reject", reason: "status_not_paid" };
  const expectedMode = checkout.test_mode ? "test" : "live";
  if (event.signatureMode !== expectedMode) return { action: "reject", reason: "mode_mismatch" };
  if (typeof event.livemode === "boolean" && event.livemode !== !checkout.test_mode)
    return { action: "reject", reason: "mode_mismatch" };
  if (String(event.currency ?? "").toUpperCase() !== (checkout.currency || "PHP").toUpperCase())
    return { action: "reject", reason: "currency_mismatch" };
  if (!checkout.amount_centavos || Number(event.amount) !== checkout.amount_centavos)
    return { action: "reject", reason: "amount_mismatch" };
  const meta = event.metadata ?? {};
  if (meta["checkout_id"] && meta["checkout_id"] !== checkout.id)
    return { action: "reject", reason: "checkout_mismatch" };
  if (meta["business_id"] && meta["business_id"] !== checkout.business_id)
    return { action: "reject", reason: "tenant_mismatch" };
  return { action: "activate" };
}

/** New period end: extend from the current end when renewing the same, still-active plan. */
export function nextPeriodEnd(
  now: Date,
  current: { plan_id: string | null; current_period_end: string | null } | null,
  planId: string,
): { start: Date; end: Date } {
  const prevEnd = current?.current_period_end ? new Date(current.current_period_end) : null;
  const base = current?.plan_id === planId && prevEnd && prevEnd > now ? prevEnd : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + 1);
  return { start: now, end };
}
