/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-only billing domain logic for the PayMongo recurring integration.
 *
 * Everything here takes an admin (service-role) client and is exercised by
 * the integration suite against a local PayMongo simulator, so the same code
 * paths run in tests, the checkout server functions and the webhook route.
 *
 * Invariants:
 *  - PayMongo is the source of truth for charges; Daraven stores ids, amounts
 *    and statuses only (never card data).
 *  - Test-mode and live-mode objects never mix: every provider call is made
 *    in an explicit mode and rows record `test_mode`.
 *  - Tenant data is never deleted on billing failures; access is downgraded.
 */
import {
  paymongoClient,
  PayMongoError,
  readConfig,
  type PayMongoInvoiceAttrs,
  type PayMongoMode,
  type PayMongoPaymentIntentAttrs,
  type PayMongoSubscriptionAttrs,
} from "./paymongo.server";
import {
  checkoutStatusFromIntent,
  cycleKeyFor,
  describeFailure,
  extractInvoiceRef,
  extractPaymentIntentRef,
  extractSubscriptionRef,
  fromCentavos,
  INVOICE_STATUS_MAP,
  nextStatusAfterFailure,
  PROVIDER_INVOICE_STATUS_MAP,
  resolveSubscriptionStatus,
  toIso,
  type CheckoutStatus,
} from "./paymongo-events";

type Admin = any;

export const OPEN_CHECKOUT_STATUSES: CheckoutStatus[] = ["pending", "awaiting_action", "processing"];
export const CHECKOUT_TTL_HOURS = 24;

/* ------------------------------------------------------------------ utils */

const nowIso = () => new Date().toISOString();

function addMonths(iso: string, months = 1) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 8 ? digits : null;
  if (digits.startsWith("63") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.length === 10) return `+63${digits}`;
  return null;
}

function providerPlanColumn(mode: PayMongoMode) {
  return mode === "test" ? "paymongo_test_plan_id" : "paymongo_plan_id";
}

function modeOf(row: { test_mode?: boolean | null } | null | undefined): PayMongoMode | null {
  if (!row || row.test_mode === null || row.test_mode === undefined) return null;
  return row.test_mode ? "test" : "live";
}

export async function logEvent(
  admin: Admin,
  input: {
    subscriptionId?: string | null;
    businessId?: string | null;
    type: string;
    source?: "system" | "webhook" | "user" | "provider";
    payload?: Record<string, unknown>;
    providerEventId?: string | null;
    livemode?: boolean | null;
  },
) {
  await admin.from("subscription_events").insert({
    subscription_id: input.subscriptionId ?? null,
    business_id: input.businessId ?? null,
    event_type: input.type,
    source: input.source ?? "system",
    payload: input.payload ?? {},
    external_event_id: input.providerEventId ?? null,
    livemode: input.livemode ?? null,
    processed_at: nowIso(),
  });
}

function periodFromSubscription(attrs: PayMongoSubscriptionAttrs | Record<string, any>) {
  const inv = (attrs["latest_invoice"] ?? null) as Record<string, any> | null;
  const start =
    toIso(attrs["current_period_start"]) ??
    toIso(inv?.["billing_cycle_start"]) ??
    toIso(inv?.["period_start"]);
  const end =
    toIso(attrs["current_period_end"]) ??
    toIso(attrs["next_billing_schedule"]) ??
    toIso(inv?.["billing_cycle_end"]) ??
    toIso(inv?.["period_end"]);
  return { start, end };
}

function invoiceIdFromSubscription(attrs: Record<string, any>): string | null {
  const inv = attrs["latest_invoice"];
  if (typeof inv === "string") return inv;
  if (inv && typeof inv === "object" && typeof inv.id === "string") return inv.id;
  if (typeof attrs["latest_invoice_id"] === "string") return attrs["latest_invoice_id"];
  return null;
}

function paymentIntentIdFromSubscription(attrs: Record<string, any>): string | null {
  const inv = attrs["latest_invoice"];
  if (inv && typeof inv === "object") {
    const pi = inv.payment_intent;
    if (typeof pi === "string") return pi;
    if (pi && typeof pi === "object" && typeof pi.id === "string") return pi.id;
    if (typeof inv.payment_intent_id === "string") return inv.payment_intent_id;
  }
  if (typeof attrs["latest_payment_intent_id"] === "string") return attrs["latest_payment_intent_id"];
  return null;
}

function paymentMethodSummary(source: any): {
  type: string | null;
  brand: string | null;
  last4: string | null;
} {
  if (!source || typeof source !== "object") return { type: null, brand: null, last4: null };
  const details = source.details ?? source;
  return {
    type: typeof source.type === "string" ? source.type : null,
    brand: typeof details.brand === "string" ? details.brand : null,
    last4: typeof details.last4 === "string" ? details.last4 : null,
  };
}

/* ------------------------------------------------------------ plan sync */

export async function ensureProviderPlan(
  admin: Admin,
  plan: { id: string; slug: string; name: string; price: number | string; description?: string | null; paymongo_plan_id?: string | null; paymongo_test_plan_id?: string | null },
  mode: PayMongoMode,
): Promise<string> {
  const col = providerPlanColumn(mode);
  const existing = (plan as any)[col] as string | null | undefined;
  if (existing) return existing;
  const client = paymongoClient(mode);
  const created = await client.createPlan({
    name: `Daraven ${plan.name}`,
    description: plan.description ?? `Daraven ERP ${plan.name} plan (monthly)`,
    amount: Number(plan.price),
    slug: plan.slug,
  });
  await admin
    .from("subscription_plans")
    .update({ [col]: created.data.id, paymongo_synced_at: nowIso() })
    .eq("id", plan.id);
  return created.data.id;
}

/** Make sure every paid plan exists at PayMongo for the given mode. */
export async function syncPlans(admin: Admin, mode: PayMongoMode) {
  const { data: plans, error } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("status", "active")
    .order("sort_order");
  if (error) throw error;
  const results: { slug: string; providerPlanId: string | null }[] = [];
  for (const plan of plans ?? []) {
    if (Number(plan.price) <= 0) {
      results.push({ slug: plan.slug, providerPlanId: null });
      continue;
    }
    const id = await ensureProviderPlan(admin, plan, mode);
    results.push({ slug: plan.slug, providerPlanId: id });
  }
  return results;
}

async function planByProviderId(admin: Admin, providerPlanId: string | null) {
  if (!providerPlanId) return null;
  const { data } = await admin
    .from("subscription_plans")
    .select("*")
    .or(`paymongo_plan_id.eq.${providerPlanId},paymongo_test_plan_id.eq.${providerPlanId}`)
    .maybeSingle();
  return data ?? null;
}

async function planBySlug(admin: Admin, slug: string) {
  const { data } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

/* ------------------------------------------------------------ customers */

export async function ensureCustomer(
  admin: Admin,
  input: {
    businessId: string;
    business: { name: string; email?: string | null; phone?: string | null };
    fallbackEmail: string | null;
    mode: PayMongoMode;
  },
): Promise<string> {
  const { mode, businessId } = input;
  const testMode = mode === "test";

  // 1. Reuse the customer already tied to this business in the same mode.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("paymongo_customer_id, test_mode")
    .eq("business_id", businessId)
    .maybeSingle();
  if (sub?.paymongo_customer_id && sub.test_mode === testMode) return sub.paymongo_customer_id;

  const { data: prev } = await admin
    .from("billing_checkouts")
    .select("paymongo_customer_id")
    .eq("business_id", businessId)
    .eq("test_mode", testMode)
    .not("paymongo_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prev?.paymongo_customer_id) return prev.paymongo_customer_id;

  // 2. Create one (PayMongo rejects duplicate emails, so fall back to lookup).
  const email = (input.business.email || input.fallbackEmail || "").trim().toLowerCase();
  if (!email) throw new BillingError("missing_email", "Add a business email under Settings before subscribing.");
  const phone = normalisePhone(input.business.phone);
  const name = (input.business.name || "Daraven workspace").trim();
  const client = paymongoClient(mode);
  try {
    const created = await client.createCustomer({
      firstName: name.slice(0, 60),
      lastName: "Daraven",
      email,
      phone: phone ?? undefined,
      idempotencyKey: `cust-${mode}-${businessId}`,
    });
    return created.data.id;
  } catch (err) {
    if (err instanceof PayMongoError && err.status < 500) {
      const found = await client.findCustomerByEmail(email).catch(() => null);
      const hit = found?.data?.[0]?.id;
      if (hit) return hit;
      if (/phone/i.test(err.message))
        throw new BillingError(
          "missing_phone",
          "Add a valid contact phone number (e.g. +639171234567) under Settings before subscribing.",
        );
    }
    throw err;
  }
}

/* ------------------------------------------------------------- errors */

export class BillingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}

/* ------------------------------------------------------------ checkouts */

export type CheckoutRow = {
  id: string;
  business_id: string;
  plan_id: string;
  created_by: string;
  status: CheckoutStatus;
  amount: number | string;
  currency: string;
  test_mode: boolean;
  payment_method_type: "card" | "paymaya" | null;
  promo_code: string | null;
  promo_snapshot: Record<string, any> | null;
  paymongo_customer_id: string | null;
  paymongo_subscription_id: string | null;
  paymongo_invoice_id: string | null;
  paymongo_payment_intent_id: string | null;
  paymongo_payment_method_id: string | null;
  next_action_url: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  attempts: number;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCheckoutRow(admin: Admin, checkoutId: string): Promise<CheckoutRow | null> {
  const { data } = await admin.from("billing_checkouts").select("*").eq("id", checkoutId).maybeSingle();
  return (data as CheckoutRow) ?? null;
}

async function updateCheckout(admin: Admin, id: string, patch: Record<string, unknown>) {
  const { data, error } = await admin
    .from("billing_checkouts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as CheckoutRow;
}

/** Expire stale checkouts and supersede other open ones for a business. */
export async function closeOpenCheckouts(
  admin: Admin,
  businessId: string,
  opts: { exceptId?: string | null; status?: "superseded" | "cancelled" | "expired" } = {},
) {
  let q = admin
    .from("billing_checkouts")
    .update({ status: opts.status ?? "superseded" })
    .eq("business_id", businessId)
    .in("status", OPEN_CHECKOUT_STATUSES);
  if (opts.exceptId) q = q.neq("id", opts.exceptId);
  await q;
}

export async function createCheckout(
  admin: Admin,
  input: {
    businessId: string;
    planSlug: string;
    userId: string;
    userEmail: string | null;
    promoCode?: string | null;
    paymentMethodType?: "card" | "paymaya" | null;
  },
): Promise<
  | { ok: true; checkoutId: string; mode: PayMongoMode }
  | { ok: false; code: string; reason: string }
> {
  const cfg = readConfig();
  if (!cfg.configured)
    return {
      ok: false,
      code: "not_configured",
      reason:
        "Online payments are not configured yet. Add the PayMongo keys in the project settings to enable checkout.",
    };
  const mode = cfg.mode;

  const plan = await planBySlug(admin, input.planSlug);
  if (!plan || plan.status !== "active") return { ok: false, code: "plan_not_found", reason: "That plan is not available." };
  if (Number(plan.price) <= 0)
    return { ok: false, code: "free_plan", reason: "The Free plan does not need a checkout." };

  const { data: business } = await admin
    .from("businesses")
    .select("id, name, email, phone")
    .eq("id", input.businessId)
    .maybeSingle();
  if (!business) return { ok: false, code: "business_not_found", reason: "Workspace not found." };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("business_id", input.businessId)
    .maybeSingle();

  const providerLinked =
    !!sub?.paymongo_subscription_id &&
    modeOf(sub) === mode &&
    ["active", "past_due", "unpaid", "trialing"].includes(sub.status) &&
    !sub.cancel_at_period_end;
  if (providerLinked && sub.plan_id === plan.id)
    return { ok: false, code: "already_subscribed", reason: `This workspace is already on ${plan.name}.` };
  if (providerLinked)
    return {
      ok: false,
      code: "use_change_plan",
      reason: "This workspace already has an active subscription. Change the plan from Billing instead.",
    };

  // Promo: validate now, redeem at activation (a failed checkout must not burn a code).
  let promoSnapshot: Record<string, unknown> | null = null;
  let promoCode: string | null = null;
  if (input.promoCode?.trim()) {
    const { validatePromoCode } = await import("./affiliate.server");
    const { PROMO_ERROR_MESSAGE } = await import("./affiliate");
    const check = await validatePromoCode(admin, {
      code: input.promoCode,
      businessId: input.businessId,
      planSlug: plan.slug,
      amount: Number(plan.price),
    });
    if (!check.ok)
      return {
        ok: false,
        code: `promo_${check.error}`,
        reason: (PROMO_ERROR_MESSAGE as Record<string, string>)[check.error] ?? "This promo code cannot be used.",
      };
    promoCode = check.promo.code;
    promoSnapshot = {
      code: check.promo.code,
      promoId: check.promo.id,
      description: check.promo.description ?? null,
      duration: check.promo.duration,
      discountType: check.promo.discount_type,
      discountValue: check.promo.discount_value,
      originalAmount: check.originalAmount,
      discountAmount: check.discountAmount,
      finalAmount: check.finalAmount,
    };
  }

  // Provider prerequisites first so a misconfiguration surfaces before a row exists.
  const providerPlanId = await ensureProviderPlan(admin, plan, mode);
  let customerId: string;
  try {
    customerId = await ensureCustomer(admin, {
      businessId: input.businessId,
      business,
      fallbackEmail: input.userEmail,
      mode,
    });
  } catch (err) {
    if (err instanceof BillingError) return { ok: false, code: err.code, reason: err.message };
    throw err;
  }

  await admin.rpc("expire_subscriptions").then(() => undefined, () => undefined);
  await closeOpenCheckouts(admin, input.businessId, { status: "superseded" });

  const { data: row, error } = await admin
    .from("billing_checkouts")
    .insert({
      business_id: input.businessId,
      plan_id: plan.id,
      created_by: input.userId,
      status: "pending",
      amount: Number(plan.price),
      currency: "PHP",
      test_mode: mode === "test",
      payment_method_type: input.paymentMethodType ?? null,
      promo_code: promoCode,
      promo_snapshot: promoSnapshot ? { ...promoSnapshot, providerPlanId } : { providerPlanId },
      paymongo_customer_id: customerId,
      expires_at: new Date(Date.now() + CHECKOUT_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  await logEvent(admin, {
    businessId: input.businessId,
    subscriptionId: sub?.id ?? null,
    type: "checkout.created",
    source: "user",
    payload: { checkout_id: row.id, plan: plan.slug, mode, promo: promoCode },
    livemode: mode === "live",
  });

  return { ok: true, checkoutId: row.id, mode };
}

/* ----------------------------------------------------- activation core */

/**
 * Apply an active provider subscription to the local row. Idempotent: calling
 * it twice with the same provider state is a no-op apart from `last_synced_at`.
 */
export async function activateFromProvider(
  admin: Admin,
  input: {
    businessId: string;
    providerSubscriptionId: string;
    attrs: Record<string, any>;
    mode: PayMongoMode;
    checkout?: CheckoutRow | null;
    planId?: string | null;
    customerId?: string | null;
    paymentMethod?: { type?: string | null; brand?: string | null; last4?: string | null } | null;
    source?: "webhook" | "system" | "user";
  },
) {
  const { attrs, mode } = input;
  const { data: current } = await admin
    .from("subscriptions")
    .select("*")
    .eq("business_id", input.businessId)
    .maybeSingle();

  const providerPlanId =
    (typeof attrs["plan"] === "object" && attrs["plan"]?.id) || attrs["plan_id"] || null;
  const mappedPlan = input.planId
    ? null
    : await planByProviderId(admin, typeof providerPlanId === "string" ? providerPlanId : null);
  const planId = input.planId ?? input.checkout?.plan_id ?? mappedPlan?.id ?? current?.plan_id ?? null;
  if (!planId) throw new BillingError("plan_unresolved", "Could not resolve the plan for this subscription.");

  const period = periodFromSubscription(attrs);
  const start = period.start ?? nowIso();
  const end = period.end ?? addMonths(start, 1);
  const invoiceId = invoiceIdFromSubscription(attrs);
  const piId = paymentIntentIdFromSubscription(attrs) ?? input.checkout?.paymongo_payment_intent_id ?? null;
  const customerId =
    input.customerId ??
    (typeof attrs["customer"] === "object" ? attrs["customer"]?.id : attrs["customer_id"]) ??
    input.checkout?.paymongo_customer_id ??
    current?.paymongo_customer_id ??
    null;

  // Any previous provider subscription in the same mode gets cancelled so a
  // business is never billed twice.
  const previousProviderId: string | null = current?.paymongo_subscription_id ?? null;
  let replaced: string | null = null;
  if (previousProviderId && previousProviderId !== input.providerSubscriptionId && modeOf(current) === mode) {
    try {
      await paymongoClient(mode).cancelSubscription(previousProviderId);
      replaced = previousProviderId;
    } catch (err) {
      if (!(err instanceof PayMongoError && [404, 400, 422].includes(err.status))) throw err;
      replaced = previousProviderId;
    }
  }

  const patch: Record<string, unknown> = {
    business_id: input.businessId,
    plan_id: planId,
    status: "active",
    trial_ends_at: null,
    cancel_at_period_end: !!attrs["cancel_at_period_end"],
    cancelled_at: null,
    ended_at: null,
    pending_plan_id: null,
    current_period_start: start,
    current_period_end: end,
    paymongo_customer_id: customerId,
    paymongo_subscription_id: input.providerSubscriptionId,
    paymongo_plan_id: typeof providerPlanId === "string" ? providerPlanId : null,
    latest_invoice_id: invoiceId,
    latest_payment_intent_id: piId,
    test_mode: mode === "test",
    activated_at: current?.activated_at ?? nowIso(),
    last_synced_at: nowIso(),
  };
  if (input.paymentMethod) {
    if (input.paymentMethod.type) patch["payment_method_type"] = input.paymentMethod.type;
    if (input.paymentMethod.brand) patch["payment_method_brand"] = input.paymentMethod.brand;
    if (input.paymentMethod.last4) patch["payment_method_last4"] = input.paymentMethod.last4;
  } else if (input.checkout?.payment_method_type) {
    patch["payment_method_type"] = input.checkout.payment_method_type;
  }

  const { data: subRow, error } = await admin
    .from("subscriptions")
    .upsert(patch, { onConflict: "business_id" })
    .select("*")
    .single();
  if (error) throw error;

  const alreadyActive =
    current?.status === "active" && current?.paymongo_subscription_id === input.providerSubscriptionId;

  // Checkout bookkeeping + promo redemption happen exactly once.
  const checkout =
    input.checkout ??
    ((
      await admin
        .from("billing_checkouts")
        .select("*")
        .eq("paymongo_subscription_id", input.providerSubscriptionId)
        .maybeSingle()
    ).data as CheckoutRow | null);

  if (checkout && checkout.status !== "succeeded") {
    await updateCheckout(admin, checkout.id, {
      status: "succeeded",
      completed_at: nowIso(),
      next_action_url: null,
      failure_code: null,
      failure_reason: null,
      paymongo_subscription_id: input.providerSubscriptionId,
      paymongo_invoice_id: invoiceId ?? checkout.paymongo_invoice_id,
      paymongo_payment_intent_id: piId ?? checkout.paymongo_payment_intent_id,
    });
    await closeOpenCheckouts(admin, input.businessId, { exceptId: checkout.id, status: "superseded" });

    if (checkout.promo_snapshot?.["code"]) {
      const { validatePromoCode, redeemPromoCode } = await import("./affiliate.server");
      const { PROVIDER_APPLIES_DISCOUNTS } = await import("./billing");
      const check = await validatePromoCode(admin, {
        code: String(checkout.promo_snapshot["code"]),
        businessId: input.businessId,
        planSlug: (await planById(admin, planId))?.slug ?? "pro",
        amount: Number(checkout.amount),
      });
      if (check.ok) {
        await redeemPromoCode(admin, {
          check,
          providerApplied: PROVIDER_APPLIES_DISCOUNTS,
          businessId: input.businessId,
          subscriptionId: subRow.id,
          planId,
          userId: checkout.created_by,
        });
      }
    }
  }

  if (!alreadyActive) {
    const { setReferralStatus } = await import("./affiliate.server");
    await setReferralStatus(admin, input.businessId, "active");
    await logEvent(admin, {
      subscriptionId: subRow.id,
      businessId: input.businessId,
      type: "subscription.activated",
      source: input.source ?? "system",
      payload: {
        paymongo_subscription_id: input.providerSubscriptionId,
        plan_id: planId,
        replaced_subscription: replaced,
        period_start: start,
        period_end: end,
        mode,
      },
      livemode: mode === "live",
    });
  }

  // The first invoice, when the provider already reports it.
  if (invoiceId && attrs["latest_invoice"] && typeof attrs["latest_invoice"] === "object") {
    await recordInvoice(admin, {
      sub: subRow,
      invoiceId,
      attrs: attrs["latest_invoice"] as Record<string, any>,
      statusOverride: null,
    });
  }

  return subRow;
}

async function planById(admin: Admin, id: string) {
  const { data } = await admin.from("subscription_plans").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

/* ------------------------------------------------------ invoices/payments */

export async function recordInvoice(
  admin: Admin,
  input: {
    sub: { id: string; business_id: string } & Record<string, any>;
    invoiceId: string;
    attrs: Record<string, any>;
    statusOverride: string | null;
  },
) {
  const a = input.attrs;
  const status =
    input.statusOverride ?? PROVIDER_INVOICE_STATUS_MAP[String(a["status"] ?? "")] ?? "open";
  const paid = status === "paid";
  const amount = fromCentavos(a["amount"] ?? a["total"] ?? a["amount_due"]) ?? 0;
  const piId = extractPaymentIntentRef({ attributes: a }) ?? null;
  const { data: existing } = await admin
    .from("billing_invoices")
    .select("id, status, paid_at, attempt_count")
    .eq("external_invoice_id", input.invoiceId)
    .maybeSingle();

  // Never regress a paid invoice on out-of-order delivery.
  const finalStatus = existing?.status === "paid" && !paid && status !== "void" ? "paid" : status;

  const row = {
    business_id: input.sub.business_id,
    subscription_id: input.sub.id,
    external_invoice_id: input.invoiceId,
    invoice_number: (a["invoice_number"] as string) ?? (a["number"] as string) ?? existing?.invoice_number ?? null,
    amount,
    currency: (a["currency"] as string) ?? "PHP",
    status: finalStatus,
    due_date: toIso(a["due_at"] ?? a["due_date"]) ?? null,
    paid_at: finalStatus === "paid" ? (toIso(a["paid_at"]) ?? existing?.paid_at ?? nowIso()) : null,
    payment_intent_id: piId,
    description: (a["description"] as string) ?? null,
    attempt_count: typeof a["attempt_count"] === "number" ? a["attempt_count"] : existing?.attempt_count ?? 0,
    next_retry_at: toIso(a["next_payment_attempt"] ?? a["next_retry_at"]) ?? null,
  };
  const { data, error } = await admin
    .from("billing_invoices")
    .upsert(row, { onConflict: "external_invoice_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function recordPayment(
  admin: Admin,
  input: {
    sub: { id: string; business_id: string } & Record<string, any>;
    paymentId: string;
    attrs: Record<string, any>;
    invoiceRowId?: string | null;
    status: "paid" | "failed" | "refunded";
  },
) {
  const a = input.attrs;
  const pm = paymentMethodSummary(a["source"]);
  const row = {
    business_id: input.sub.business_id,
    subscription_id: input.sub.id,
    paymongo_payment_id: input.paymentId,
    amount: fromCentavos(a["amount"]) ?? 0,
    currency: (a["currency"] as string) ?? "PHP",
    status: input.status,
    paid_at: input.status === "paid" ? (toIso(a["paid_at"]) ?? nowIso()) : null,
    failure_reason:
      input.status === "failed"
        ? describeFailure(a["failed_code"] as string, a["failed_message"] as string)
        : null,
    payment_intent_id: extractPaymentIntentRef({ attributes: a }) ?? null,
    invoice_id: input.invoiceRowId ?? null,
    method_brand: pm.brand,
    method_last4: pm.last4,
    description: (a["description"] as string) ?? null,
  };
  const { data, error } = await admin
    .from("subscription_payments")
    .upsert(row, { onConflict: "paymongo_payment_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** A collected invoice: subscription current, commission recorded once per cycle. */
export async function applyInvoicePaid(
  admin: Admin,
  input: {
    sub: Record<string, any>;
    invoiceId: string;
    attrs: Record<string, any>;
    mode: PayMongoMode;
    source?: "webhook" | "system";
  },
) {
  const { sub, attrs } = input;
  const invoice = await recordInvoice(admin, { sub, invoiceId: input.invoiceId, attrs, statusOverride: "paid" });

  const start = toIso(attrs["billing_cycle_start"] ?? attrs["period_start"]);
  const end = toIso(attrs["billing_cycle_end"] ?? attrs["period_end"]);
  const patch: Record<string, unknown> = {
    status: "active",
    latest_invoice_id: input.invoiceId,
    last_synced_at: nowIso(),
  };
  const piId = extractPaymentIntentRef({ attributes: attrs });
  if (piId) patch["latest_payment_intent_id"] = piId;
  if (start) patch["current_period_start"] = start;
  if (end) patch["current_period_end"] = end;
  else if (start) patch["current_period_end"] = addMonths(start, 1);
  // A scheduled downgrade takes effect on the first invoice of the new cycle.
  if (sub.pending_plan_id) {
    patch["plan_id"] = sub.pending_plan_id;
    patch["pending_plan_id"] = null;
  }
  const { data: updated } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("id", sub.id)
    .select("*")
    .single();

  const { recordCommissionForPayment, setReferralStatus } = await import("./affiliate.server");
  await recordCommissionForPayment(admin, {
    businessId: sub.business_id,
    subscriptionId: sub.id,
    collectedAmount: Number(invoice.amount),
    currency: invoice.currency ?? "PHP",
    externalReference: `invoice:${input.invoiceId}`,
    invoiceId: invoice.id,
    cycleKey: cycleKeyFor(
      { id: sub.id, current_period_start: (patch["current_period_start"] as string) ?? sub.current_period_start },
      attrs,
      input.invoiceId,
    ),
    sourceType: "invoice",
  });
  await setReferralStatus(admin, sub.business_id, "active");
  await logEvent(admin, {
    subscriptionId: sub.id,
    businessId: sub.business_id,
    type: "invoice.paid",
    source: input.source ?? "system",
    payload: { invoice_id: input.invoiceId, amount: invoice.amount },
    livemode: input.mode === "live",
  });
  return updated ?? sub;
}

/** A failed collection: invoice marked, subscription escalated once per invoice. */
export async function applyPaymentFailure(
  admin: Admin,
  input: {
    sub: Record<string, any>;
    invoiceId: string | null;
    attrs: Record<string, any>;
    mode: PayMongoMode;
    reason?: string | null;
    source?: "webhook" | "system";
  },
) {
  const { sub } = input;
  let alreadyCounted = false;
  if (input.invoiceId) {
    const { data: existing } = await admin
      .from("billing_invoices")
      .select("id, status")
      .eq("external_invoice_id", input.invoiceId)
      .maybeSingle();
    alreadyCounted = existing?.status === "payment_failed";
    if (existing?.status === "paid") return sub; // late failure after success: ignore
    await recordInvoice(admin, { sub, invoiceId: input.invoiceId, attrs: input.attrs, statusOverride: "payment_failed" });
  }
  if (alreadyCounted || !["active", "past_due", "unpaid", "trialing"].includes(sub.status)) return sub;

  const next = nextStatusAfterFailure(sub.status);
  const { data: updated } = await admin
    .from("subscriptions")
    .update({ status: next, last_synced_at: nowIso() })
    .eq("id", sub.id)
    .select("*")
    .single();
  const { setReferralStatus } = await import("./affiliate.server");
  await setReferralStatus(admin, sub.business_id, "past_due");
  await logEvent(admin, {
    subscriptionId: sub.id,
    businessId: sub.business_id,
    type: "payment.failed",
    source: input.source ?? "system",
    payload: { invoice_id: input.invoiceId, from: sub.status, to: next, reason: input.reason ?? null },
    livemode: input.mode === "live",
  });
  return updated ?? sub;
}

/* ------------------------------------------------------- provider sync */

/** Pull the provider subscription and reconcile the local row. */
export async function syncSubscriptionFromProvider(
  admin: Admin,
  sub: Record<string, any>,
  opts: { attrs?: Record<string, any>; source?: "webhook" | "system" | "user" } = {},
) {
  const mode = modeOf(sub) ?? readConfig().mode;
  if (!sub.paymongo_subscription_id) return sub;
  const attrs =
    opts.attrs ?? (await paymongoClient(mode).getSubscription(sub.paymongo_subscription_id)).data.attributes;

  const providerStatus = String(attrs["status"] ?? "");
  const mapped = resolveSubscriptionStatus("subscription.updated", attrs as Record<string, unknown>);
  const period = periodFromSubscription(attrs);
  const patch: Record<string, unknown> = { last_synced_at: nowIso() };
  if (period.start) patch["current_period_start"] = period.start;
  if (period.end) patch["current_period_end"] = period.end;
  const invoiceId = invoiceIdFromSubscription(attrs);
  if (invoiceId) patch["latest_invoice_id"] = invoiceId;
  const piId = paymentIntentIdFromSubscription(attrs);
  if (piId) patch["latest_payment_intent_id"] = piId;

  // Plan mapping with the "never downgrade early" rule.
  const providerPlanId =
    (typeof attrs["plan"] === "object" && (attrs["plan"] as any)?.id) || attrs["plan_id"] || null;
  if (typeof providerPlanId === "string" && providerPlanId !== sub.paymongo_plan_id) {
    patch["paymongo_plan_id"] = providerPlanId;
    const newPlan = await planByProviderId(admin, providerPlanId);
    const oldPlan = await planById(admin, sub.plan_id);
    if (newPlan && newPlan.id !== sub.plan_id) {
      if (!oldPlan || Number(newPlan.price) >= Number(oldPlan.price)) {
        patch["plan_id"] = newPlan.id;
        patch["pending_plan_id"] = null;
      } else {
        patch["pending_plan_id"] = newPlan.id;
      }
    }
  }

  if (mapped === "cancelled" || providerStatus === "cancelled" || providerStatus === "canceled") {
    const endsLater = sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now();
    patch["cancelled_at"] = sub.cancelled_at ?? toIso(attrs["canceled_at"] ?? attrs["cancelled_at"]) ?? nowIso();
    if (endsLater && ["active", "past_due"].includes(sub.status)) {
      patch["cancel_at_period_end"] = true; // keep access until the paid period ends
    } else {
      patch["status"] = "cancelled";
      patch["ended_at"] = nowIso();
      patch["cancel_at_period_end"] = false;
    }
  } else if (mapped && mapped !== sub.status) {
    if (mapped === "active" && sub.status !== "active") {
      patch["trial_ends_at"] = null;
      patch["activated_at"] = sub.activated_at ?? nowIso();
    }
    patch["status"] = mapped;
  }

  const { data: updated, error } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("id", sub.id)
    .select("*")
    .single();
  if (error) throw error;

  if (invoiceId && attrs["latest_invoice"] && typeof attrs["latest_invoice"] === "object") {
    const invAttrs = attrs["latest_invoice"] as Record<string, any>;
    if (invAttrs["status"] === "paid") {
      const { data: existing } = await admin
        .from("billing_invoices")
        .select("status")
        .eq("external_invoice_id", invoiceId)
        .maybeSingle();
      if (existing?.status !== "paid")
        await applyInvoicePaid(admin, { sub: updated, invoiceId, attrs: invAttrs, mode, source: "system" });
    } else {
      await recordInvoice(admin, { sub: updated, invoiceId, attrs: invAttrs, statusOverride: null });
    }
  }

  if (patch["status"] && patch["status"] !== sub.status) {
    const { setReferralStatus } = await import("./affiliate.server");
    if (patch["status"] === "cancelled") await setReferralStatus(admin, sub.business_id, "cancelled");
    else if (patch["status"] === "past_due" || patch["status"] === "unpaid")
      await setReferralStatus(admin, sub.business_id, "past_due");
    else if (patch["status"] === "active") await setReferralStatus(admin, sub.business_id, "active");
    await logEvent(admin, {
      subscriptionId: sub.id,
      businessId: sub.business_id,
      type: `subscription.${patch["status"]}`,
      source: opts.source ?? "system",
      payload: { provider_status: providerStatus, from: sub.status },
      livemode: mode === "live",
    });
  }
  return updated;
}

/* --------------------------------------------- checkout payment attempts */

export type AttemptResult =
  | { status: "succeeded"; checkout: CheckoutRow }
  | { status: "awaiting_action"; checkout: CheckoutRow; redirectUrl: string }
  | { status: "processing"; checkout: CheckoutRow }
  | { status: "failed"; checkout: CheckoutRow; reason: string; code: string | null };

async function inspectIntent(
  mode: PayMongoMode,
  piId: string,
): Promise<{ attrs: PayMongoPaymentIntentAttrs; status: CheckoutStatus; reason: string | null; code: string | null; redirectUrl: string | null }> {
  const pi = await paymongoClient(mode).getPaymentIntent(piId);
  const attrs = pi.data.attributes;
  const err = attrs.last_payment_error as any;
  const status = checkoutStatusFromIntent(attrs.status, err);
  const redirectUrl = attrs.next_action?.redirect?.url ?? null;
  return {
    attrs,
    status,
    code: err?.failed_code ?? err?.code ?? null,
    reason: status === "failed" ? describeFailure(err?.failed_code ?? err?.code, err?.failed_message ?? err?.detail) : null,
    redirectUrl,
  };
}

async function settleCheckout(
  admin: Admin,
  checkout: CheckoutRow,
  mode: PayMongoMode,
  subAttrs: Record<string, any> | null,
  piId: string | null,
): Promise<AttemptResult> {
  const providerSubId = checkout.paymongo_subscription_id;
  // 1. Provider says active -> done.
  if (subAttrs && String(subAttrs["status"]) === "active" && providerSubId) {
    let pm: { type?: string | null; brand?: string | null; last4?: string | null } | null = null;
    if (checkout.paymongo_payment_method_id) {
      try {
        const method = await paymongoClient(mode).getPaymentMethod(checkout.paymongo_payment_method_id);
        const s = paymentMethodSummary(method.data.attributes);
        pm = { type: s.type ?? checkout.payment_method_type, brand: s.brand, last4: s.last4 };
      } catch {
        pm = { type: checkout.payment_method_type };
      }
    }
    await activateFromProvider(admin, {
      businessId: checkout.business_id,
      providerSubscriptionId: providerSubId,
      attrs: subAttrs,
      mode,
      checkout,
      planId: checkout.plan_id,
      paymentMethod: pm,
      source: "user",
    });
    const fresh = (await getCheckoutRow(admin, checkout.id))!;
    return { status: "succeeded", checkout: fresh };
  }

  // 2. Otherwise the payment intent tells us what happens next.
  if (piId) {
    const intent = await inspectIntent(mode, piId);
    if (intent.status === "succeeded" && providerSubId) {
      const refreshed = (await paymongoClient(mode).getSubscription(providerSubId)).data.attributes;
      if (String(refreshed["status"]) === "active") return settleCheckout(admin, checkout, mode, refreshed, null);
      const c = await updateCheckout(admin, checkout.id, { status: "processing", paymongo_payment_intent_id: piId, next_action_url: null });
      return { status: "processing", checkout: c };
    }
    if (intent.status === "awaiting_action" && intent.redirectUrl) {
      const c = await updateCheckout(admin, checkout.id, {
        status: "awaiting_action",
        paymongo_payment_intent_id: piId,
        next_action_url: intent.redirectUrl,
      });
      return { status: "awaiting_action", checkout: c, redirectUrl: intent.redirectUrl };
    }
    if (intent.status === "failed") {
      const c = await updateCheckout(admin, checkout.id, {
        status: "failed",
        paymongo_payment_intent_id: piId,
        next_action_url: null,
        failure_code: intent.code,
        failure_reason: intent.reason,
      });
      await logEvent(admin, {
        businessId: checkout.business_id,
        type: "checkout.failed",
        source: "user",
        payload: { checkout_id: checkout.id, code: intent.code, reason: intent.reason },
        livemode: mode === "live",
      });
      return { status: "failed", checkout: c, reason: intent.reason ?? describeFailure(null), code: intent.code };
    }
    const c = await updateCheckout(admin, checkout.id, { status: "processing", paymongo_payment_intent_id: piId });
    return { status: "processing", checkout: c };
  }

  // 3. Incomplete without an intent we can see: wait for the webhook.
  const c = await updateCheckout(admin, checkout.id, { status: "processing" });
  return { status: "processing", checkout: c };
}

/**
 * Attach a tokenised payment method to a checkout. The first attempt creates
 * the provider subscription (which charges immediately); retries pay the open
 * invoice of the existing incomplete subscription.
 */
export async function attachPaymentMethodToCheckout(
  admin: Admin,
  input: {
    checkoutId: string;
    paymentMethodId: string;
    paymentMethodType: "card" | "paymaya";
    returnUrl: string;
  },
): Promise<AttemptResult | { status: "invalid"; reason: string; checkout: CheckoutRow | null }> {
  const checkout = await getCheckoutRow(admin, input.checkoutId);
  if (!checkout) return { status: "invalid", reason: "Checkout not found.", checkout: null };
  if (checkout.status === "succeeded") return { status: "succeeded", checkout };
  if (!["pending", "failed", "awaiting_action", "processing"].includes(checkout.status))
    return { status: "invalid", reason: "This checkout is no longer open. Start a new one.", checkout };
  if (new Date(checkout.expires_at).getTime() < Date.now()) {
    const c = await updateCheckout(admin, checkout.id, { status: "expired" });
    return { status: "invalid", reason: "This checkout has expired. Start a new one.", checkout: c };
  }

  const mode: PayMongoMode = checkout.test_mode ? "test" : "live";
  const client = paymongoClient(mode);
  const plan = await planById(admin, checkout.plan_id);
  if (!plan) return { status: "invalid", reason: "Plan not found.", checkout };
  const providerPlanId = await ensureProviderPlan(admin, plan, mode);

  let working = await updateCheckout(admin, checkout.id, {
    status: "processing",
    payment_method_type: input.paymentMethodType,
    paymongo_payment_method_id: input.paymentMethodId,
    attempts: (checkout.attempts ?? 0) + 1,
    failure_code: null,
    failure_reason: null,
    next_action_url: null,
  });

  try {
    let subAttrs: Record<string, any> | null = null;
    let piId: string | null = null;

    if (!working.paymongo_subscription_id) {
      const created = await client.createSubscription({
        customerId: working.paymongo_customer_id!,
        planId: providerPlanId,
        paymentMethodId: input.paymentMethodId,
        returnUrl: input.returnUrl,
        metadata: { checkout_id: working.id, business_id: working.business_id, app: "daraven" },
        idempotencyKey: `sub-${mode}-${working.id}-${working.attempts}`,
      });
      subAttrs = created.data.attributes as Record<string, any>;
      piId = paymentIntentIdFromSubscription(subAttrs);
      working = await updateCheckout(admin, working.id, {
        paymongo_subscription_id: created.data.id,
        paymongo_invoice_id: invoiceIdFromSubscription(subAttrs),
        paymongo_payment_intent_id: piId,
      });
      if (!piId && String(subAttrs["status"]) !== "active") {
        // Some responses omit the nested invoice; fetch it explicitly.
        const invoiceId = invoiceIdFromSubscription(subAttrs);
        if (invoiceId) {
          const inv = await client.getInvoice(invoiceId).catch(() => null);
          piId = inv ? extractPaymentIntentRef({ attributes: inv.data.attributes as any }) : null;
        }
      }
    } else {
      // Retry: pay the latest open invoice of the incomplete subscription.
      const current = (await client.getSubscription(working.paymongo_subscription_id)).data.attributes as Record<string, any>;
      if (String(current["status"]) === "active") return settleCheckout(admin, working, mode, current, null);
      const invoiceId = invoiceIdFromSubscription(current) ?? working.paymongo_invoice_id;
      let paidAttrs: PayMongoInvoiceAttrs | null = null;
      if (invoiceId) {
        const paid = await client.payInvoice(invoiceId, {
          paymentMethodId: input.paymentMethodId,
          returnUrl: input.returnUrl,
        });
        paidAttrs = paid.data.attributes;
        piId = extractPaymentIntentRef({ attributes: paidAttrs as any });
      } else {
        const currentPi = paymentIntentIdFromSubscription(current);
        if (!currentPi) throw new BillingError("no_invoice", "No open invoice to retry.");
        await client.attachPaymentIntent(currentPi, { paymentMethodId: input.paymentMethodId, returnUrl: input.returnUrl });
        piId = currentPi;
      }
      subAttrs = (await client.getSubscription(working.paymongo_subscription_id)).data.attributes as Record<string, any>;
      working = await updateCheckout(admin, working.id, {
        paymongo_invoice_id: invoiceId ?? working.paymongo_invoice_id,
        paymongo_payment_intent_id: piId ?? working.paymongo_payment_intent_id,
      });
    }

    return await settleCheckout(admin, working, mode, subAttrs, piId ?? working.paymongo_payment_intent_id);
  } catch (err) {
    const reason =
      err instanceof PayMongoError
        ? describeFailure(err.code, err.message)
        : err instanceof BillingError
          ? err.message
          : "The payment could not be completed. Please try again.";
    const code = err instanceof PayMongoError ? (err.code ?? `http_${err.status}`) : err instanceof BillingError ? err.code : "unexpected";
    const c = await updateCheckout(admin, working.id, {
      status: "failed",
      failure_code: code,
      failure_reason: reason,
      next_action_url: null,
    });
    await logEvent(admin, {
      businessId: working.business_id,
      type: "checkout.failed",
      source: "user",
      payload: { checkout_id: working.id, code, reason },
      livemode: mode === "live",
    });
    if (!(err instanceof PayMongoError) && !(err instanceof BillingError)) {
      console.error("[billing] attach failed", err);
    }
    return { status: "failed", checkout: c, reason, code };
  }
}

/** Re-check a checkout against the provider (after a 3DS return or while polling). */
export async function verifyCheckout(admin: Admin, checkoutId: string): Promise<AttemptResult | { status: CheckoutStatus; checkout: CheckoutRow }> {
  const checkout = await getCheckoutRow(admin, checkoutId);
  if (!checkout) throw new BillingError("not_found", "Checkout not found.");
  if (["succeeded", "expired", "cancelled", "superseded"].includes(checkout.status))
    return { status: checkout.status, checkout };
  if (!checkout.paymongo_subscription_id) {
    if (new Date(checkout.expires_at).getTime() < Date.now()) {
      const c = await updateCheckout(admin, checkout.id, { status: "expired" });
      return { status: "expired", checkout: c };
    }
    return { status: checkout.status, checkout };
  }
  const mode: PayMongoMode = checkout.test_mode ? "test" : "live";
  const subAttrs = (await paymongoClient(mode).getSubscription(checkout.paymongo_subscription_id)).data
    .attributes as Record<string, any>;
  const piId = paymentIntentIdFromSubscription(subAttrs) ?? checkout.paymongo_payment_intent_id;
  const result = await settleCheckout(admin, checkout, mode, subAttrs, piId);
  return result;
}

export async function abandonCheckout(admin: Admin, checkoutId: string) {
  const checkout = await getCheckoutRow(admin, checkoutId);
  if (!checkout) return null;
  if (!OPEN_CHECKOUT_STATUSES.includes(checkout.status) && checkout.status !== "failed") return checkout;
  if (checkout.paymongo_subscription_id) {
    const mode: PayMongoMode = checkout.test_mode ? "test" : "live";
    await paymongoClient(mode).cancelSubscription(checkout.paymongo_subscription_id).catch(() => undefined);
  }
  return updateCheckout(admin, checkout.id, { status: "cancelled" });
}

/* ------------------------------------------- lifecycle (user-initiated) */

export async function cancelSubscriptionForBusiness(
  admin: Admin,
  input: { businessId: string; userId: string | null; immediately?: boolean; reason?: string | null },
) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", input.businessId).maybeSingle();
  if (!sub) return { ok: false as const, reason: "No subscription found." };
  const free = await planBySlug(admin, "free");
  if (!free) return { ok: false as const, reason: "Free plan missing." };

  await closeOpenCheckouts(admin, input.businessId, { status: "cancelled" });

  const mode = modeOf(sub) ?? readConfig().mode;
  let providerCancelled = false;
  if (sub.paymongo_subscription_id && !["cancelled", "incomplete_expired"].includes(sub.status)) {
    try {
      await paymongoClient(mode).cancelSubscription(sub.paymongo_subscription_id);
      providerCancelled = true;
    } catch (err) {
      if (!(err instanceof PayMongoError && [404, 400, 422].includes(err.status))) throw err;
      providerCancelled = true; // already cancelled at the provider
    }
  }

  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end).getTime() : 0;
  const keepsAccess =
    !input.immediately && ["active", "past_due", "trialing"].includes(sub.status) && periodEnd > Date.now();

  const patch: Record<string, unknown> = {
    cancelled_at: nowIso(),
    pending_plan_id: null,
    last_synced_at: nowIso(),
  };
  if (keepsAccess) {
    patch["cancel_at_period_end"] = true;
  } else {
    patch["status"] = "cancelled";
    patch["cancel_at_period_end"] = false;
    patch["ended_at"] = nowIso();
  }
  const { data: updated } = await admin.from("subscriptions").update(patch).eq("id", sub.id).select("*").single();

  const { setReferralStatus } = await import("./affiliate.server");
  await setReferralStatus(admin, input.businessId, "cancelled");
  await logEvent(admin, {
    subscriptionId: sub.id,
    businessId: input.businessId,
    type: keepsAccess ? "subscription.cancel_scheduled" : "subscription.cancelled",
    source: "user",
    payload: {
      by: input.userId,
      reason: input.reason ?? null,
      provider_cancelled: providerCancelled,
      access_until: keepsAccess ? sub.current_period_end : null,
    },
    livemode: mode === "live",
  });
  return { ok: true as const, accessUntil: keepsAccess ? (sub.current_period_end as string) : null, subscription: updated };
}

/** Undo a scheduled cancellation while the paid period is still running (trials only; provider cancels are final). */
export async function resumeSubscriptionForBusiness(admin: Admin, input: { businessId: string; userId: string | null }) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", input.businessId).maybeSingle();
  if (!sub) return { ok: false as const, reason: "No subscription found." };
  if (!sub.cancel_at_period_end) return { ok: false as const, reason: "Nothing to resume." };
  if (sub.paymongo_subscription_id)
    return {
      ok: false as const,
      code: "resubscribe",
      reason: "The payment provider has already closed this subscription. Start a new one to continue after the current period.",
    };
  const { data: updated } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: false, cancelled_at: null, last_synced_at: nowIso() })
    .eq("id", sub.id)
    .select("*")
    .single();
  await logEvent(admin, { subscriptionId: sub.id, businessId: input.businessId, type: "subscription.resumed", source: "user", payload: { by: input.userId } });
  return { ok: true as const, subscription: updated };
}

export async function changePlanForBusiness(
  admin: Admin,
  input: { businessId: string; planSlug: string; userId: string | null },
) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", input.businessId).maybeSingle();
  const target = await planBySlug(admin, input.planSlug);
  if (!sub || !target) return { ok: false as const, code: "not_found", reason: "Subscription or plan not found." };
  if (Number(target.price) <= 0) return { ok: false as const, code: "use_cancel", reason: "Cancel the subscription to move to Free." };
  if (!sub.paymongo_subscription_id || !["active", "past_due"].includes(sub.status) || sub.cancel_at_period_end)
    return { ok: false as const, code: "use_checkout", reason: "No active paid subscription to change. Start a checkout instead." };
  if (sub.plan_id === target.id && !sub.pending_plan_id)
    return { ok: false as const, code: "same_plan", reason: `Already on ${target.name}.` };

  const mode = modeOf(sub) ?? readConfig().mode;
  const providerPlanId = await ensureProviderPlan(admin, target, mode);
  const current = await planById(admin, sub.plan_id);
  const upgrade = !current || Number(target.price) >= Number(current.price);

  const res = await paymongoClient(mode).changeSubscriptionPlan(sub.paymongo_subscription_id, providerPlanId);
  const attrs = res.data.attributes as Record<string, any>;

  const patch: Record<string, unknown> = { paymongo_plan_id: providerPlanId, last_synced_at: nowIso() };
  if (upgrade) {
    patch["plan_id"] = target.id;
    patch["pending_plan_id"] = null;
  } else {
    patch["pending_plan_id"] = target.id;
  }
  const period = periodFromSubscription(attrs);
  if (period.start) patch["current_period_start"] = period.start;
  if (period.end) patch["current_period_end"] = period.end;
  const { data: updated } = await admin.from("subscriptions").update(patch).eq("id", sub.id).select("*").single();

  await logEvent(admin, {
    subscriptionId: sub.id,
    businessId: input.businessId,
    type: upgrade ? "subscription.plan_changed" : "subscription.plan_change_scheduled",
    source: "user",
    payload: { by: input.userId, from: current?.slug ?? null, to: target.slug, effective: upgrade ? "now" : "next_cycle" },
    livemode: mode === "live",
  });
  return {
    ok: true as const,
    effective: upgrade ? ("now" as const) : ("next_cycle" as const),
    effectiveAt: upgrade ? nowIso() : (updated?.current_period_end ?? null),
    subscription: updated,
  };
}

export async function updatePaymentMethodForBusiness(
  admin: Admin,
  input: { businessId: string; paymentMethodId: string; paymentMethodType: "card" | "paymaya"; returnUrl: string },
) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", input.businessId).maybeSingle();
  if (!sub?.paymongo_subscription_id || ["cancelled", "incomplete_expired"].includes(sub.status))
    return { ok: false as const, reason: "There is no active subscription to update." };
  const mode = modeOf(sub) ?? readConfig().mode;
  const client = paymongoClient(mode);
  const res = await client.changeSubscriptionPaymentMethod(sub.paymongo_subscription_id, input.paymentMethodId, input.returnUrl);
  const attrs = res.data.attributes as Record<string, any>;
  const redirectUrl: string | null =
    attrs["next_action"]?.redirect?.url ?? attrs["payment_method_verification"]?.redirect?.url ?? null;

  let pm: { type: string | null; brand: string | null; last4: string | null } = { type: input.paymentMethodType, brand: null, last4: null };
  try {
    const method = await client.getPaymentMethod(input.paymentMethodId);
    const s = paymentMethodSummary(method.data.attributes);
    pm = { type: s.type ?? input.paymentMethodType, brand: s.brand, last4: s.last4 };
  } catch {
    /* summary is cosmetic */
  }
  await admin
    .from("subscriptions")
    .update({ payment_method_type: pm.type, payment_method_brand: pm.brand, payment_method_last4: pm.last4, last_synced_at: nowIso() })
    .eq("id", sub.id);
  await logEvent(admin, {
    subscriptionId: sub.id,
    businessId: input.businessId,
    type: "payment_method.updated",
    source: "user",
    payload: { brand: pm.brand, last4: pm.last4, type: pm.type },
    livemode: mode === "live",
  });
  return { ok: true as const, redirectUrl, paymentMethod: pm };
}

/** Retry collection of the latest open/failed invoice (after a payment method update). */
export async function retryOpenInvoiceForBusiness(admin: Admin, input: { businessId: string; returnUrl: string }) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("business_id", input.businessId).maybeSingle();
  if (!sub?.paymongo_subscription_id) return { ok: false as const, reason: "No provider subscription." };
  const mode = modeOf(sub) ?? readConfig().mode;
  const client = paymongoClient(mode);

  const { data: openInvoice } = await admin
    .from("billing_invoices")
    .select("*")
    .eq("subscription_id", sub.id)
    .in("status", ["open", "payment_failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const invoiceId: string | null = openInvoice?.external_invoice_id ?? sub.latest_invoice_id ?? null;
  if (!invoiceId) return { ok: false as const, reason: "There is no outstanding invoice to retry." };

  try {
    const res = await client.payInvoice(invoiceId, { returnUrl: input.returnUrl });
    const attrs = res.data.attributes as Record<string, any>;
    if (String(attrs["status"]) === "paid") {
      await applyInvoicePaid(admin, { sub, invoiceId, attrs, mode, source: "system" });
      return { ok: true as const, status: "paid" as const, redirectUrl: null };
    }
    const piId = extractPaymentIntentRef({ attributes: attrs });
    if (piId) {
      const intent = await inspectIntent(mode, piId);
      if (intent.status === "awaiting_action" && intent.redirectUrl)
        return { ok: true as const, status: "awaiting_action" as const, redirectUrl: intent.redirectUrl };
      if (intent.status === "failed") return { ok: false as const, reason: intent.reason ?? describeFailure(null) };
    }
    // Settle from the provider's subscription view.
    const synced = await syncSubscriptionFromProvider(admin, sub, { source: "user" });
    return { ok: true as const, status: synced.status === "active" ? ("paid" as const) : ("processing" as const), redirectUrl: null };
  } catch (err) {
    if (err instanceof PayMongoError) return { ok: false as const, reason: describeFailure(err.code, err.message) };
    throw err;
  }
}

/* ------------------------------------------------------------ webhooks */

export type WebhookEnvelope = {
  eventId: string | null;
  type: string;
  livemode: boolean | null;
  resource: { id?: string; type?: string; attributes?: Record<string, any> } | null;
  /** Mode proven by the signature. */
  signatureMode: PayMongoMode;
};

export type WebhookOutcome = {
  action: string;
  duplicate?: boolean;
  subscriptionId?: string | null;
  businessId?: string | null;
};

/** Process one verified webhook event. Idempotent per PayMongo event id. */
export async function processWebhookEvent(admin: Admin, ev: WebhookEnvelope): Promise<WebhookOutcome> {
  const mode: PayMongoMode = ev.livemode === null ? ev.signatureMode : ev.livemode ? "live" : "test";
  const attrs = (ev.resource?.attributes ?? {}) as Record<string, any>;

  // Idempotency: an event that was fully processed is acknowledged immediately;
  // one that previously failed is re-run.
  let eventRowId: string | null = null;
  if (ev.eventId) {
    const { data: seen } = await admin
      .from("subscription_events")
      .select("id, processed_at")
      .eq("external_event_id", ev.eventId)
      .maybeSingle();
    if (seen?.processed_at) return { action: "duplicate", duplicate: true };
    eventRowId = seen?.id ?? null;
  }

  const providerSubId = extractSubscriptionRef(ev.type, ev.resource);
  const invoiceId = extractInvoiceRef(ev.type, ev.resource);
  const piId = extractPaymentIntentRef(ev.resource);

  // Locate the subscription (row) and/or checkout this event concerns.
  let sub: Record<string, any> | null = null;
  let checkout: CheckoutRow | null = null;
  if (providerSubId) {
    sub = (await admin.from("subscriptions").select("*").eq("paymongo_subscription_id", providerSubId).maybeSingle()).data ?? null;
    checkout = (await admin.from("billing_checkouts").select("*").eq("paymongo_subscription_id", providerSubId).maybeSingle()).data ?? null;
  }
  if (!sub && !checkout && piId) {
    checkout = (await admin.from("billing_checkouts").select("*").eq("paymongo_payment_intent_id", piId).maybeSingle()).data ?? null;
    if (!checkout)
      sub = (await admin.from("subscriptions").select("*").eq("latest_payment_intent_id", piId).maybeSingle()).data ?? null;
    if (!sub && !checkout) {
      const { data: inv } = await admin.from("billing_invoices").select("subscription_id").eq("payment_intent_id", piId).maybeSingle();
      if (inv?.subscription_id) sub = (await admin.from("subscriptions").select("*").eq("id", inv.subscription_id).maybeSingle()).data ?? null;
    }
  }
  if (!sub && checkout) {
    sub = (await admin.from("subscriptions").select("*").eq("business_id", checkout.business_id).maybeSingle()).data ?? null;
  }
  const businessId: string | null = sub?.business_id ?? checkout?.business_id ?? null;

  // Record (or claim) the event before acting on it.
  const eventPayload = {
    type: ev.type,
    resource_id: ev.resource?.id ?? null,
    resource_type: ev.resource?.type ?? null,
    status: attrs["status"] ?? null,
    amount: attrs["amount"] ?? null,
    subscription_ref: providerSubId,
    invoice_ref: invoiceId,
    payment_intent_ref: piId,
  };
  if (eventRowId) {
    await admin.from("subscription_events").update({ payload: eventPayload, error: null, subscription_id: sub?.id ?? null, business_id: businessId }).eq("id", eventRowId);
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("subscription_events")
      .insert({
        subscription_id: sub?.id ?? null,
        business_id: businessId,
        event_type: ev.type,
        source: "webhook",
        external_event_id: ev.eventId,
        livemode: ev.livemode ?? ev.signatureMode === "live",
        payload: eventPayload,
      })
      .select("id")
      .single();
    if (insErr) {
      if ((insErr as any).code === "23505") return { action: "duplicate", duplicate: true };
      throw insErr;
    }
    eventRowId = inserted.id;
  }

  const finish = async (action: string) => {
    if (eventRowId) await admin.from("subscription_events").update({ processed_at: nowIso() }).eq("id", eventRowId);
    return { action, subscriptionId: sub?.id ?? null, businessId } satisfies WebhookOutcome;
  };

  try {
    // Mode mismatch guard: the row's mode must match the event's mode.
    const rowMode = modeOf(sub) ?? (checkout ? (checkout.test_mode ? "test" : "live") : null);
    if (rowMode && rowMode !== mode) return finish("ignored_mode_mismatch");

    /* ---- subscription.* -------------------------------------------------- */
    if (ev.type.startsWith("subscription.") && !ev.type.startsWith("subscription.invoice")) {
      if (!providerSubId) return finish("ignored_no_subscription_ref");
      const status = resolveSubscriptionStatus(ev.type, attrs);

      if (status === "active") {
        const bizId = businessId ?? (attrs["metadata"]?.business_id as string | undefined) ?? null;
        if (!bizId) return finish("unmatched_subscription");
        await activateFromProvider(admin, {
          businessId: bizId,
          providerSubscriptionId: providerSubId,
          attrs,
          mode,
          checkout,
          planId: checkout?.plan_id ?? null,
          source: "webhook",
        });
        return finish("subscription_activated");
      }

      if (!sub) {
        // An incomplete/cancelled provider subscription that only a checkout knows about.
        if (checkout && (status === "incomplete_expired" || status === "cancelled") && OPEN_CHECKOUT_STATUSES.includes(checkout.status)) {
          await updateCheckout(admin, checkout.id, { status: status === "cancelled" ? "cancelled" : "expired" });
          return finish("checkout_closed");
        }
        return finish("unmatched_subscription");
      }

      if (!status) return finish("ignored_unknown_status");
      await syncSubscriptionFromProvider(admin, sub, { attrs, source: "webhook" });
      return finish(`subscription_${status}`);
    }

    /* ---- subscription.invoice.* ------------------------------------------ */
    if (ev.type.startsWith("subscription.invoice.")) {
      if (!invoiceId) return finish("ignored_no_invoice_ref");
      if (!sub) {
        if (checkout && ev.type === "subscription.invoice.paid" && providerSubId) {
          const providerSub = (await paymongoClient(mode).getSubscription(providerSubId)).data.attributes as Record<string, any>;
          await activateFromProvider(admin, {
            businessId: checkout.business_id,
            providerSubscriptionId: providerSubId,
            attrs: providerSub,
            mode,
            checkout,
            planId: checkout.plan_id,
            source: "webhook",
          });
          const fresh = (await admin.from("subscriptions").select("*").eq("business_id", checkout.business_id).maybeSingle()).data;
          if (fresh) await applyInvoicePaid(admin, { sub: fresh, invoiceId, attrs, mode, source: "webhook" });
          return finish("activated_from_invoice");
        }
        return finish("unmatched_invoice");
      }
      const mapped = INVOICE_STATUS_MAP[ev.type] ?? PROVIDER_INVOICE_STATUS_MAP[String(attrs["status"] ?? "")] ?? null;
      if (mapped === "paid") {
        if (["incomplete", "cancelled", "incomplete_expired"].includes(sub.status) || checkout?.status !== "succeeded" && checkout) {
          // First payment of a checkout-created subscription arriving via invoice.
          const providerSub = providerSubId
            ? ((await paymongoClient(mode).getSubscription(providerSubId)).data.attributes as Record<string, any>)
            : null;
          if (providerSub && providerSubId)
            await activateFromProvider(admin, {
              businessId: sub.business_id,
              providerSubscriptionId: providerSubId,
              attrs: providerSub,
              mode,
              checkout,
              planId: checkout?.plan_id ?? null,
              source: "webhook",
            });
          sub = (await admin.from("subscriptions").select("*").eq("id", sub.id).maybeSingle()).data ?? sub;
        }
        await applyInvoicePaid(admin, { sub: sub!, invoiceId, attrs, mode, source: "webhook" });
        return finish("invoice_paid");
      }
      if (mapped === "payment_failed") {
        const err = attrs["last_payment_error"] ?? attrs["failure"] ?? null;
        await applyPaymentFailure(admin, {
          sub,
          invoiceId,
          attrs,
          mode,
          reason: err ? describeFailure(err.failed_code ?? err.code, err.failed_message ?? err.detail ?? (typeof err === "string" ? err : null)) : null,
          source: "webhook",
        });
        return finish("invoice_payment_failed");
      }
      if (mapped === "void") {
        await recordInvoice(admin, { sub, invoiceId, attrs, statusOverride: "void" });
        const { reverseCommissionFor } = await import("./affiliate.server");
        await reverseCommissionFor(admin, `invoice:${invoiceId}`, "Invoice voided");
        return finish("invoice_voided");
      }
      await recordInvoice(admin, { sub, invoiceId, attrs, statusOverride: mapped });
      return finish(`invoice_${mapped ?? "recorded"}`);
    }

    /* ---- payment.* ------------------------------------------------------- */
    if (ev.type.startsWith("payment.refunded") || ev.type.startsWith("payment.reversed") || ev.type.startsWith("refund.")) {
      const paymentRef = (attrs["payment_id"] as string) ?? ev.resource?.id ?? null;
      const { reverseCommissionFor } = await import("./affiliate.server");
      if (paymentRef) {
        await reverseCommissionFor(admin, `payment:${paymentRef}`, "Payment refunded");
        await admin.from("subscription_payments").update({ status: "refunded", refunded_amount: fromCentavos(attrs["amount"]) ?? 0 }).eq("paymongo_payment_id", paymentRef);
      }
      const invoiceRef = (attrs["invoice_id"] as string) ?? null;
      if (invoiceRef) await reverseCommissionFor(admin, `invoice:${invoiceRef}`, "Payment refunded");
      return finish("refund_recorded");
    }

    if (ev.type === "payment.paid" || ev.type === "payment.failed") {
      if (!ev.resource?.id) return finish("ignored_no_payment_id");
      const paid = ev.type === "payment.paid";
      if (!sub && checkout && paid && checkout.paymongo_subscription_id) {
        const providerSub = (await paymongoClient(mode).getSubscription(checkout.paymongo_subscription_id)).data.attributes as Record<string, any>;
        await activateFromProvider(admin, {
          businessId: checkout.business_id,
          providerSubscriptionId: checkout.paymongo_subscription_id,
          attrs: providerSub,
          mode,
          checkout,
          planId: checkout.plan_id,
          source: "webhook",
        });
        sub = (await admin.from("subscriptions").select("*").eq("business_id", checkout.business_id).maybeSingle()).data ?? null;
      }
      if (!sub) return finish("unmatched_payment");

      const { data: invRow } = piId
        ? await admin.from("billing_invoices").select("id, external_invoice_id, status").eq("payment_intent_id", piId).maybeSingle()
        : { data: null };
      const payment = await recordPayment(admin, {
        sub,
        paymentId: ev.resource.id,
        attrs,
        invoiceRowId: invRow?.id ?? null,
        status: paid ? "paid" : "failed",
      });
      const pm = paymentMethodSummary(attrs["source"]);
      if (paid) {
        const patch: Record<string, unknown> = { status: "active", last_synced_at: nowIso() };
        if (pm.brand) patch["payment_method_brand"] = pm.brand;
        if (pm.last4) patch["payment_method_last4"] = pm.last4;
        if (pm.type) patch["payment_method_type"] = pm.type;
        if (sub.pending_plan_id) {
          patch["plan_id"] = sub.pending_plan_id;
          patch["pending_plan_id"] = null;
        }
        await admin.from("subscriptions").update(patch).eq("id", sub.id);
        if (invRow && invRow.status !== "paid")
          await admin.from("billing_invoices").update({ status: "paid", paid_at: toIso(attrs["paid_at"]) ?? nowIso() }).eq("id", invRow.id);
        const { recordCommissionForPayment, setReferralStatus } = await import("./affiliate.server");
        await recordCommissionForPayment(admin, {
          businessId: sub.business_id,
          subscriptionId: sub.id,
          paymentId: payment.id,
          invoiceId: invRow?.id ?? null,
          collectedAmount: Number(payment.amount),
          currency: payment.currency ?? "PHP",
          externalReference: `payment:${ev.resource.id}`,
          cycleKey: cycleKeyFor(sub as any, attrs, invRow?.external_invoice_id ?? null),
          sourceType: "payment",
        });
        await setReferralStatus(admin, sub.business_id, "active");
        return finish("payment_paid");
      }
      await applyPaymentFailure(admin, {
        sub,
        invoiceId: invRow?.external_invoice_id ?? null,
        attrs,
        mode,
        reason: describeFailure(attrs["failed_code"], attrs["failed_message"]),
        source: "webhook",
      });
      return finish("payment_failed");
    }

    return finish("ignored_unhandled_type");
  } catch (err) {
    if (eventRowId)
      await admin
        .from("subscription_events")
        .update({ error: err instanceof Error ? err.message.slice(0, 500) : String(err), processed_at: null })
        .eq("id", eventRowId);
    throw err;
  }
}

/* ------------------------------------------------------------ housekeeping */

export async function runExpirySweep(admin: Admin) {
  const { data, error } = await admin.rpc("expire_subscriptions");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    trialsExpired: Number(row?.trials_expired ?? 0),
    subscriptionsEnded: Number(row?.subscriptions_ended ?? 0),
    checkoutsExpired: Number(row?.checkouts_expired ?? 0),
  };
}

/* ------------------------------------------------------------ DTOs */

export function checkoutToView(row: CheckoutRow, plan: { slug: string; name: string; price: number | string } | null) {
  const snap = row.promo_snapshot ?? {};
  return {
    id: row.id,
    businessId: row.business_id,
    status: row.status,
    amount: Number(row.amount),
    currency: row.currency,
    testMode: row.test_mode,
    paymentMethodType: row.payment_method_type,
    plan: plan ? { slug: plan.slug, name: plan.name, price: Number(plan.price) } : null,
    promo: snap["code"]
      ? {
          code: String(snap["code"]),
          description: (snap["description"] as string | null) ?? null,
          duration: (snap["duration"] as string | null) ?? null,
          originalAmount: Number(snap["originalAmount"] ?? row.amount),
          discountAmount: Number(snap["discountAmount"] ?? 0),
          finalAmount: Number(snap["finalAmount"] ?? row.amount),
        }
      : null,
    nextActionUrl: row.next_action_url,
    failureReason: row.failure_reason,
    failureCode: row.failure_code,
    attempts: row.attempts,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    hasProviderSubscription: !!row.paymongo_subscription_id,
  };
}

export type CheckoutView = ReturnType<typeof checkoutToView>;
