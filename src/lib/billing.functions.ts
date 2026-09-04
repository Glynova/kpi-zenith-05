/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DISCOUNT_SETTLEMENT_NOTE, PROVIDER_APPLIES_DISCOUNTS } from "@/lib/billing";

const businessInput = z.object({ businessId: z.string().uuid() });



async function assertAdmin(supabase: any, userId: string, businessId: string) {
  const { data, error } = await supabase
    .from("user_businesses")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !["owner", "admin"].includes(data.role)) {
    throw new Error("Only owners and admins can manage billing");
  }
  return data.role as string;
}

async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/** Billing history for the current business (payments + invoices + events). */
export const getBillingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [payments, invoices, events] = await Promise.all([
      supabase
        .from("subscription_payments")
        .select("*")
        .eq("business_id", data.businessId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("billing_invoices")
        .select("*")
        .eq("business_id", data.businessId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("subscription_events")
        .select("id, event_type, created_at")
        .eq("business_id", data.businessId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      payments: (payments.data ?? []) as any[],
      invoices: (invoices.data ?? []) as any[],
      events: (events.data ?? []) as any[],
    };
  });

/** Non-sensitive integration status for the admin "Billing diagnostics" panel. */
export const getBillingDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { readConfig, readWebhookSecret } = await import("@/lib/paymongo.server");
    const cfg = readConfig();
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("paymongo_subscription_id, paymongo_customer_id, test_mode, status")
      .eq("business_id", data.businessId)
      .maybeSingle();
    const { data: plans } = await context.supabase
      .from("subscription_plans")
      .select("slug, paymongo_plan_id");
    return {
      secretKeyConfigured: cfg.configured,
      publicKeyConfigured: !!cfg.publicKey,
      webhookSecretConfigured: !!readWebhookSecret(),
      mode: cfg.mode,
      recurringBillingReady:
        cfg.configured && !!(plans ?? []).some((p: any) => p.paymongo_plan_id),
      plansSynced: (plans ?? []).filter((p: any) => p.paymongo_plan_id).map((p: any) => p.slug),
      subscriptionLinked: !!(sub as any)?.paymongo_subscription_id,
      customerLinked: !!(sub as any)?.paymongo_customer_id,
      testMode: (sub as any)?.test_mode ?? true,
      status: (sub as any)?.status ?? null,
    };
  });

/** Sync the Pro / Business plans into PayMongo (admin action, idempotent). */
export const syncPaymongoPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { paymongo, readConfig } = await import("@/lib/paymongo.server");
    if (!readConfig().configured) {
      return { configured: false, synced: [] as string[] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans } = await (supabaseAdmin as any)
      .from("subscription_plans")
      .select("id, slug, name, price, paymongo_plan_id")
      .gt("price", 0);

    const synced: string[] = [];
    for (const plan of plans ?? []) {
      if (plan.paymongo_plan_id) continue;
      try {
        const created = await paymongo.createPlan({
          name: `Daraven ${plan.name}`,
          amount: Number(plan.price),
        });
        await (supabaseAdmin as any)
          .from("subscription_plans")
          .update({ paymongo_plan_id: created.data.id })
          .eq("id", plan.id);
        synced.push(plan.slug);
      } catch (err) {
        return {
          configured: true,
          synced,
          error: err instanceof Error ? err.message : "PayMongo plan sync failed",
        };
      }
    }
    return { configured: true, synced };
  });

/**
 * Begin a plan change. When PayMongo is configured a subscription is created
 * there and we store only its id; otherwise we return a clean unconfigured
 * result so the UI can explain what is missing instead of faking billing.
 */
export const startSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    businessInput
      .extend({
        planSlug: z.enum(["free", "pro", "business"]),
        promoCode: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: plan } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("slug", data.planSlug)
      .maybeSingle();
    if (!plan) throw new Error("Plan not found");

    // Promo codes are always validated server-side; a client-supplied discount
    // is never trusted.
    const { validatePromoCode, redeemPromoCode } = await import("@/lib/affiliate.server");
    const { PROMO_ERROR_MESSAGE } = await import("@/lib/affiliate");
    let promoCheck: Awaited<ReturnType<typeof validatePromoCode>> | null = null;
    if (data.promoCode && Number(plan.price) > 0) {
      promoCheck = await validatePromoCode(admin, {
        code: data.promoCode,
        businessId: data.businessId,
        planSlug: data.planSlug,
        amount: Number(plan.price),
      });
      if (!promoCheck.ok) {
        return {
          ok: false,
          configured: true,
          reason: PROMO_ERROR_MESSAGE[promoCheck.error],
          checkoutUrl: null,
        };
      }
    }


    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("business_id", data.businessId)
      .maybeSingle();

    // Downgrading to Free never needs a payment provider.
    if (Number(plan.price) === 0) {
      await admin.from("subscriptions").upsert(
        {
          business_id: data.businessId,
          plan_id: plan.id,
          status: "active",
          trial_ends_at: null,
          pending_plan_id: null,
          pending_plan_effective_at: null,
          current_period_start: new Date().toISOString(),
          current_period_end: null,
        },
        { onConflict: "business_id" },
      );
      await admin.from("subscription_events").insert({
        subscription_id: sub?.id ?? null,
        business_id: data.businessId,
        event_type: "plan.changed.free",
        payload: { plan: plan.slug },
      });
      return { ok: true, configured: true, checkoutUrl: null, effectiveAt: new Date().toISOString() };
    }

    const { paymongo, readConfig } = await import("@/lib/paymongo.server");
    const cfg = readConfig();
    if (!cfg.configured || !plan.paymongo_plan_id) {
      return {
        ok: false,
        configured: false,
        reason: !cfg.configured
          ? "PayMongo secret key is not configured."
          : "This plan has not been synced to PayMongo yet.",
        checkoutUrl: null,
      };
    }

    // Ensure a PayMongo customer exists for the business owner.
    let customerId: string | null = sub?.paymongo_customer_id ?? null;
    if (!customerId) {
      const { data: business } = await admin
        .from("businesses")
        .select("name, email, phone")
        .eq("id", data.businessId)
        .maybeSingle();
      const email = business?.email || (context.claims as any)?.email;
      if (!email) {
        return {
          ok: false,
          configured: true,
          reason: "Add a billing email to the business profile before subscribing.",
          checkoutUrl: null,
        };
      }
      const customer = await paymongo.createCustomer({
        firstName: (business?.name ?? "Daraven").slice(0, 30),
        lastName: "Account",
        email,
        phone: business?.phone ?? undefined,
        idempotencyKey: `cust-${data.businessId}`,
      });
      customerId = customer.data.id;
    }

    const created = await paymongo.createSubscription({
      customerId,
      planId: plan.paymongo_plan_id,
      idempotencyKey: `sub-${data.businessId}-${plan.slug}`,
    });
    const attrs = created.data.attributes as Record<string, any>;

    await admin.from("subscriptions").upsert(
      {
        business_id: data.businessId,
        plan_id: plan.id,
        paymongo_customer_id: customerId,
        paymongo_subscription_id: created.data.id,
        status: attrs["status"] === "active" ? "active" : "incomplete",
        test_mode: cfg.mode !== "live",
        current_period_start: attrs["current_period_start"] ?? new Date().toISOString(),
        current_period_end: attrs["next_billing_schedule"] ?? null,
      },
      { onConflict: "business_id" },
    );
    await admin.from("subscription_events").insert({
      business_id: data.businessId,
      event_type: "subscription.created",
      payload: { plan: plan.slug, paymongo_subscription_id: created.data.id },
    });

    // Freeze the applied discount against the subscription so later edits to
    // the promo code cannot rewrite historical billing.
    if (promoCheck?.ok) {
      const { data: fresh } = await admin
        .from("subscriptions")
        .select("id")
        .eq("business_id", data.businessId)
        .maybeSingle();
      await redeemPromoCode(admin, {
        check: promoCheck,
        providerApplied: PROVIDER_APPLIES_DISCOUNTS,
        businessId: data.businessId,
        subscriptionId: fresh?.id ?? null,
        planId: plan.id,
        userId: context.userId,
      });
    }

    return {
      ok: true,
      configured: true,
      checkoutUrl: (attrs["checkout_url"] as string) ?? null,
      effectiveAt: new Date().toISOString(),
      discountApplied: promoCheck?.ok
        ? {
            code: promoCheck.promo.code as string,
            discountAmount: promoCheck.discountAmount,
            finalAmount: promoCheck.finalAmount,
            providerApplied: PROVIDER_APPLIES_DISCOUNTS,
            settlement: DISCOUNT_SETTLEMENT_NOTE,
          }
        : null,
    };
  });


export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!sub) throw new Error("No subscription to cancel");

    if (sub.paymongo_subscription_id) {
      const { paymongo, readConfig } = await import("@/lib/paymongo.server");
      if (readConfig().configured) {
        try {
          await paymongo.cancelSubscription(sub.paymongo_subscription_id);
        } catch {
          /* keep local cancellation even if the provider call fails */
        }
      }
    }

    await admin
      .from("subscriptions")
      .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
      .eq("id", sub.id);
    await admin.from("subscription_events").insert({
      subscription_id: sub.id,
      business_id: data.businessId,
      event_type: "subscription.cancel_requested",
      payload: {},
    });
    // Data is never deleted; access continues until the period ends.
    return { ok: true, accessUntil: sub.current_period_end ?? sub.trial_ends_at ?? null };
  });

export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!sub) throw new Error("No subscription found");
    await admin
      .from("subscriptions")
      .update({ cancel_at_period_end: false, cancelled_at: null })
      .eq("id", sub.id);
    await admin.from("subscription_events").insert({
      subscription_id: sub.id,
      business_id: data.businessId,
      event_type: "subscription.resumed",
      payload: {},
    });
    return { ok: true };
  });

/** Platform-wide billing overview for internal admins. */


export const platformBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: subs }, { data: plans }, { data: payments }] = await Promise.all([
      admin
        .from("subscriptions")
        .select("id, business_id, plan_id, status, trial_ends_at, current_period_end, businesses(name)")
        .order("created_at", { ascending: false }),
      admin.from("subscription_plans").select("*").order("sort_order"),
      admin
        .from("subscription_payments")
        .select("id, business_id, amount, currency, status, paid_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const planMap = new Map<string, any>((plans ?? []).map((p: any) => [p.id as string, p]));
    const mrr = (subs ?? [])
      .filter((s: any) => s.status === "active")
      .reduce((sum: number, s: any) => sum + Number(planMap.get(s.plan_id)?.price ?? 0), 0);
    return {
      subscriptions: (subs ?? []).map((s: any) => ({
        ...s,
        plan_name: planMap.get(s.plan_id)?.name ?? "—",
        plan_price: Number(planMap.get(s.plan_id)?.price ?? 0),
        business_name: s.businesses?.name ?? "—",
      })),
      plans: plans ?? [],
      payments: payments ?? [],
      mrr,
    };
  });

export const amIPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { isPlatformAdmin: !!data };
  });
