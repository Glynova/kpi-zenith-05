/* eslint-disable @typescript-eslint/no-explicit-any --
 * Admin client bypasses generated table types; values are narrowed before use. */
/**
 * One-time QR Ph payment for a platform plan (one month). Never recurring:
 * each renewal creates a new billing_checkouts row and a new QR.
 * The amount always comes from subscription_plans on the server.
 */
import {
  decidePaidEvent,
  extractQrImage,
  nextPeriodEnd,
  QRPH_MIN_CENTAVOS,
  sanitizePayMongoError,
  toCentavos,
  type CheckoutForEvent,
} from "@/lib/qrph-core";
import type { PayMongoMode } from "@/lib/paymongo.server";

const QR_TTL_MS = 30 * 60 * 1000;

export type PlanQrPh = {
  checkoutId: string;
  qrImage: string;
  amountCentavos: number;
  expiresAt: string;
  mode: PayMongoMode;
};

async function pmCall(base: string, secret: string, path: string, body?: unknown, idem?: string) {
  const res = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${btoa(`${secret}:`)}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail ?? `PayMongo request failed (${res.status})`;
    throw new Error(sanitizePayMongoError(detail));
  }
  return json;
}

/** Create the PayMongo intent → qrph method → attach, and return the QR image. */
export async function createQrPhIntent(opts: {
  base: string;
  secret: string;
  amountCentavos: number;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<{ intentId: string; qrImage: string }> {
  if (!Number.isInteger(opts.amountCentavos) || opts.amountCentavos < QRPH_MIN_CENTAVOS)
    throw new Error("Amount must be at least ₱1.00 for QR Ph");
  const pi = await pmCall(
    opts.base,
    opts.secret,
    "/payment_intents",
    {
      data: {
        attributes: {
          amount: opts.amountCentavos,
          currency: "PHP",
          capture_type: "automatic",
          payment_method_allowed: ["qrph"],
          description: opts.description,
          metadata: opts.metadata,
        },
      },
    },
    `pi-${opts.idempotencyKey}`,
  );
  const intentId: string | undefined = pi?.data?.id;
  const clientKey: string | undefined = pi?.data?.attributes?.client_key;
  if (!intentId || !clientKey) throw new Error("PayMongo did not return a payment intent");
  const method = await pmCall(opts.base, opts.secret, "/payment_methods", {
    data: { attributes: { type: "qrph" } },
  });
  const methodId: string | undefined = method?.data?.id;
  if (!methodId) throw new Error("PayMongo did not return a QR Ph payment method");
  const att = await pmCall(opts.base, opts.secret, `/payment_intents/${intentId}/attach`, {
    data: { attributes: { payment_method: methodId, client_key: clientKey } },
  });
  const qrImage = extractQrImage(att);
  if (!qrImage) throw new Error("PayMongo did not return a QR code");
  return { intentId, qrImage };
}

export async function startPlanQrPh(
  admin: any,
  input: {
    businessId: string;
    planSlug: string;
    userId: string;
    mode: PayMongoMode;
    secret: string;
    base: string;
  },
): Promise<PlanQrPh> {
  const { data: plan } = await admin
    .from("subscription_plans")
    .select("id, name, slug, price, currency, is_active")
    .eq("slug", input.planSlug)
    .maybeSingle();
  if (!plan || plan.is_active === false) throw new Error("Plan not found");
  const amountCentavos = toCentavos(plan.price); // trusted DB price only
  if (amountCentavos < QRPH_MIN_CENTAVOS) throw new Error("This plan does not need payment");
  const testMode = input.mode !== "live";

  // Reuse a still-valid QR for the same plan/amount/mode.
  const { data: existing } = await admin
    .from("billing_checkouts")
    .select("id, qr_image, amount_centavos, expires_at")
    .eq("business_id", input.businessId)
    .eq("plan_id", plan.id)
    .eq("payment_method_type", "qrph")
    .eq("test_mode", testMode)
    .eq("amount_centavos", amountCentavos)
    .in("status", ["pending", "awaiting_action"])
    .gt("expires_at", new Date(Date.now() + 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.qr_image)
    return {
      checkoutId: existing.id,
      qrImage: existing.qr_image,
      amountCentavos,
      expiresAt: existing.expires_at,
      mode: input.mode,
    };

  const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
  const { data: row, error } = await admin
    .from("billing_checkouts")
    .insert({
      business_id: input.businessId,
      plan_id: plan.id,
      created_by: input.userId,
      amount: amountCentavos / 100,
      amount_centavos: amountCentavos,
      currency: "PHP",
      test_mode: testMode,
      payment_method_type: "qrph",
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw new Error("Could not start checkout");

  try {
    const { intentId, qrImage } = await createQrPhIntent({
      base: input.base,
      secret: input.secret,
      amountCentavos,
      description: `Daraven ${plan.name} plan — 1 month`,
      metadata: {
        checkout_id: row.id,
        business_id: input.businessId,
        plan_id: plan.id,
        source: "daraven_plan_qrph",
      },
      idempotencyKey: row.id,
    });
    await admin
      .from("billing_checkouts")
      .update({
        paymongo_payment_intent_id: intentId,
        qr_image: qrImage,
        status: "awaiting_action",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { checkoutId: row.id, qrImage, amountCentavos, expiresAt, mode: input.mode };
  } catch (err) {
    const reason = sanitizePayMongoError(err);
    await admin
      .from("billing_checkouts")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", row.id);
    throw new Error(reason);
  }
}

/** Activate / extend one month. Only called after a verified, matched paid event. */
async function activateCheckout(
  admin: any,
  checkout: CheckoutForEvent & { plan_id: string; amount: number },
  paymentId: string | null,
  eventId: string | null,
): Promise<"activated" | "duplicate"> {
  const now = new Date();
  // Atomic claim: only the first delivery flips the checkout to succeeded.
  const { data: claimed } = await admin
    .from("billing_checkouts")
    .update({
      status: "succeeded",
      completed_at: now.toISOString(),
      paymongo_payment_id: paymentId,
      updated_at: now.toISOString(),
    })
    .eq("id", checkout.id)
    .in("status", ["pending", "awaiting_action", "processing"])
    .select("id");
  if (!claimed || claimed.length === 0) return "duplicate";

  const { data: current } = await admin
    .from("subscriptions")
    .select("id, plan_id, current_period_end")
    .eq("business_id", checkout.business_id)
    .maybeSingle();
  const { start, end } = nextPeriodEnd(now, current, checkout.plan_id);
  await admin.from("subscriptions").upsert(
    {
      business_id: checkout.business_id,
      plan_id: checkout.plan_id,
      status: "active",
      test_mode: checkout.test_mode,
      trial_ends_at: null,
      cancelled_at: null,
      pending_plan_id: null,
      pending_plan_effective_at: null,
      payment_method_type: "qrph",
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
    },
    { onConflict: "business_id" },
  );
  const { data: s2 } = await admin
    .from("subscriptions")
    .select("id")
    .eq("business_id", checkout.business_id)
    .maybeSingle();
  await admin.from("subscription_events").insert({
    subscription_id: s2?.id ?? null,
    business_id: checkout.business_id,
    event_type: "qrph.plan.paid",
    external_event_id: eventId,
    payload: { checkout_id: checkout.id, amount_centavos: checkout.amount_centavos },
  });
  await admin.from("billing_invoices").upsert(
    {
      business_id: checkout.business_id,
      subscription_id: s2?.id ?? null,
      external_invoice_id: `qrph:${checkout.paymongo_payment_intent_id}`,
      amount: (checkout.amount_centavos ?? 0) / 100,
      currency: "PHP",
      status: "paid",
      paid_at: now.toISOString(),
    },
    { onConflict: "external_invoice_id" },
  );
  if (s2) {
    try {
      const { recordCommissionForPayment } = await import("@/lib/affiliate.server");
      await recordCommissionForPayment(admin, {
        businessId: checkout.business_id,
        subscriptionId: s2.id,
        collectedAmount: (checkout.amount_centavos ?? 0) / 100,
        currency: "PHP",
        externalReference: `qrph:${checkout.paymongo_payment_intent_id}`,
        cycleKey: `checkout:${checkout.id}`,
        sourceType: "payment",
      });
    } catch (e) {
      console.error("Affiliate commission failed for QR Ph checkout", checkout.id, e);
    }
  }
  return "activated";
}

export type PlanEventResult =
  | { handled: false }
  | { handled: true; outcome: string };

/**
 * Handle a signature-verified PayMongo event for a plan QR Ph checkout.
 * Returns handled:false when the intent isn't a plan checkout.
 */
export async function processPlanQrPhEvent(
  admin: any,
  ev: {
    signatureMode: PayMongoMode;
    eventId: string | null;
    type: string;
    resourceId: string | null;
    attrs: Record<string, any>;
    livemode?: unknown;
  },
): Promise<PlanEventResult> {
  const intentId =
    (ev.attrs["payment_intent_id"] as string | undefined) ??
    (ev.type.startsWith("qrph") || ev.type.startsWith("payment_intent")
      ? (ev.resourceId ?? undefined)
      : undefined);
  if (!intentId) return { handled: false };
  const { data: checkout } = await admin
    .from("billing_checkouts")
    .select(
      "id, business_id, plan_id, status, currency, amount, amount_centavos, test_mode, payment_method_type, paymongo_payment_intent_id",
    )
    .eq("paymongo_payment_intent_id", intentId)
    .eq("payment_method_type", "qrph")
    .maybeSingle();
  if (!checkout) return { handled: false };

  if (ev.type === "payment.paid") {
    const decision = decidePaidEvent(
      {
        signatureMode: ev.signatureMode,
        intentId,
        amount: ev.attrs["amount"],
        currency: ev.attrs["currency"],
        status: ev.attrs["status"],
        livemode: ev.livemode ?? ev.attrs["livemode"],
        metadata: ev.attrs["metadata"] ?? null,
      },
      checkout,
    );
    if (decision.action !== "activate") {
      if (decision.action === "reject")
        console.warn("QR Ph plan event rejected", checkout.id, decision.reason);
      return { handled: true, outcome: decision.reason };
    }
    const r = await activateCheckout(admin, checkout, ev.resourceId, ev.eventId);
    return { handled: true, outcome: r };
  }
  if (ev.type === "payment.failed" || ev.type === "qrph.expired") {
    const expectedMode = checkout.test_mode ? "test" : "live";
    if (ev.signatureMode !== expectedMode) return { handled: true, outcome: "mode_mismatch" };
    await admin
      .from("billing_checkouts")
      .update({
        status: ev.type === "payment.failed" ? "failed" : "expired",
        failure_reason: ev.type === "payment.failed" ? "Payment failed" : "QR code expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", checkout.id)
      .in("status", ["pending", "awaiting_action", "processing"]);
    return { handled: true, outcome: ev.type === "payment.failed" ? "failed" : "expired" };
  }
  return { handled: true, outcome: "ignored_type" };
}
