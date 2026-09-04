/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Affiliate partner + referral + promo server functions.
 *
 * Partner-scoped reads run through the caller's authenticated Supabase client
 * so RLS (`partner_id = current_partner_id()`) is the real security boundary;
 * the service-role client is only used for writes the partner may not perform
 * themselves (click capture, attribution, approvals).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Resolves the caller's partner record and refuses anything but an *approved*
 * (status = 'active') partner. The database enforces the same rule through
 * `current_partner_id()`, so a suspended or pending partner sees no rows even
 * if this check were bypassed.
 */
async function requireActivePartner(context: any) {
  const { data, error } = await context.supabase
    .from("affiliate_partners")
    .select("*")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: approved affiliate partners only");
  return data as any;
}

/* ------------------------------------------------------- public: referrals */

/** Records a referral-link click. Public by design (no account required). */
export const recordReferralClick = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(2).max(32),
        landingPath: z.string().max(300).optional(),
        referrer: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { partnerByCode } = await import("@/lib/affiliate.server");
    const admin = supabaseAdmin as any;
    const partner = await partnerByCode(admin, data.code);
    if (!partner) return { valid: false as const };
    await admin.from("affiliate_clicks").insert({
      partner_id: partner.id,
      referral_code: partner.referral_code,
      landing_path: data.landingPath ?? null,
      referrer: data.referrer ?? null,
    });
    return {
      valid: true as const,
      partnerName: partner.display_name as string,
      code: partner.referral_code as string,
    };
  });

/**
 * Persists referral attribution against a business (called right after the
 * workspace is created). First attribution wins.
 */
export const attachReferralToBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ businessId: z.string().uuid(), code: z.string().min(2).max(32) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // The caller must belong to the business they are attributing.
    const { data: membership } = await context.supabase
      .from("user_businesses")
      .select("id")
      .eq("business_id", data.businessId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { attachReferral, partnerByCode } = await import("@/lib/affiliate.server");
    const admin = supabaseAdmin as any;
    const partner = await partnerByCode(admin, data.code);
    if (!partner || partner.status !== "active") return { attributed: false as const };
    // Partners can't refer their own workspaces.
    if (partner.user_id === context.userId) return { attributed: false as const };
    await attachReferral(admin, {
      businessId: data.businessId,
      userId: context.userId,
      partnerId: partner.id,
      referralCode: partner.referral_code,
      source: "referral_link",
    });
    return { attributed: true as const, partner: partner.display_name as string };
  });

/* --------------------------------------------------------------- promo API */

export const previewPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        code: z.string().min(1).max(40),
        planSlug: z.enum(["free", "pro", "business"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: membership } = await context.supabase
      .from("user_businesses")
      .select("role")
      .eq("business_id", data.businessId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validatePromoCode } = await import("@/lib/affiliate.server");
    const { PROMO_ERROR_MESSAGE } = await import("@/lib/affiliate");
    const admin = supabaseAdmin as any;

    const { data: plan } = await admin
      .from("subscription_plans")
      .select("id, price, slug")
      .eq("slug", data.planSlug)
      .maybeSingle();
    if (!plan) throw new Error("Plan not found");

    const check = await validatePromoCode(admin, {
      code: data.code,
      businessId: data.businessId,
      planSlug: data.planSlug,
      amount: Number(plan.price),
    });
    const { DISCOUNT_SETTLEMENT_NOTE, PROVIDER_APPLIES_DISCOUNTS } = await import("@/lib/billing");
    if (!check.ok)
      return {
        ok: false as const,
        message: PROMO_ERROR_MESSAGE[check.error],
        reason: PROMO_ERROR_MESSAGE[check.error],
      };
    return {
      ok: true as const,
      code: check.promo.code as string,
      description: (check.promo.description as string) ?? null,
      discountType: check.promo.discount_type as string,
      discountValue: Number(check.promo.discount_value),
      duration: check.promo.duration as string,
      originalAmount: check.originalAmount,
      discountAmount: check.discountAmount,
      finalAmount: check.finalAmount,
      // Honest provider truth: never claim a discounted charge that PayMongo
      // will not actually make.
      providerApplied: PROVIDER_APPLIES_DISCOUNTS,
      settlement: DISCOUNT_SETTLEMENT_NOTE,
    };
  });

/* ------------------------------------------------------------ applications */

export const applyAsAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fullName: z.string().min(2).max(120),
        email: z.string().email(),
        company: z.string().max(120).optional(),
        website: z.string().max(200).optional(),
        audience: z.string().max(1000).optional(),
        motivation: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("affiliate_applications").insert({
      user_id: context.userId,
      full_name: data.fullName,
      email: data.email,
      company: data.company ?? null,
      website: data.website ?? null,
      audience: data.audience ?? null,
      motivation: data.motivation ?? null,
    });
    if (error) {
      if ((error as any).code === "23505")
        throw new Error("You already have an application under review.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Partner record + latest application for the signed-in user. */
export const getMyAffiliateStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: partner }, { data: application }] = await Promise.all([
      context.supabase
        .from("affiliate_partners")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("affiliate_applications")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return { partner: (partner ?? null) as any, application: (application ?? null) as any };
  });

/* ---------------------------------------------------------- partner portal */

export const getPartnerDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const partner = await requireActivePartner(context);
    const partnerId = partner.id as string;

    const [{ data: referrals }, { data: commissions }, { data: payouts }, { count: clicks }] =
      await Promise.all([
        supabase
          .from("affiliate_referrals")
          .select("*")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("affiliate_commissions")
          .select("*")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("affiliate_payouts")
          .select("*")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("affiliate_clicks")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerId),
      ]);

    const rows = (commissions ?? []) as any[];
    const { summariseLedger } = await import("@/lib/affiliate.server");
    const totals = summariseLedger(rows);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = rows
      .filter((r) => new Date(r.created_at) >= monthStart)
      .reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);

    // Business names for the customers table (service-role read limited to the
    // partner's own referred businesses only).
    const ids = (referrals ?? []).map((r: any) => r.business_id).filter(Boolean);
    let businesses: any[] = [];
    let subscriptions: any[] = [];
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;
      const [{ data: b }, { data: s }] = await Promise.all([
        admin.from("businesses").select("id, name, created_at").in("id", ids),
        admin
          .from("subscriptions")
          .select(
            "business_id, status, plan_id, current_period_end, trial_ends_at, subscription_plans(name, price)",
          )
          .in("business_id", ids),
      ]);
      businesses = b ?? [];
      subscriptions = s ?? [];
    }

    const { data: promoCodes } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("affiliate_partner_id", partnerId)
      .order("created_at", { ascending: false });

    return {
      partner: partner as any,
      referrals: (referrals ?? []) as any[],
      commissions: rows,
      payouts: (payouts ?? []) as any[],
      promoCodes: (promoCodes ?? []) as any[],
      businesses,
      subscriptions,
      clicks: clicks ?? 0,
      totals: { ...totals, thisMonth: Math.round(thisMonth * 100) / 100 },
    };
  });

export const updatePartnerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        displayName: z.string().min(2).max(120),
        email: z.string().email(),
        company: z.string().max(120).optional(),
        website: z.string().max(200).optional(),
        payoutMethod: z.string().max(60).optional(),
        payoutDetails: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Approved partners only; privileged columns are additionally frozen by a
    // database trigger so a profile save can never change programme terms.
    await requireActivePartner(context);
    const { error } = await context.supabase
      .from("affiliate_partners")
      .update({
        display_name: data.displayName,
        email: data.email,
        company: data.company ?? null,
        website: data.website ?? null,
        payout_method: data.payoutMethod ?? null,
        payout_details: data.payoutDetails ?? {},
      })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
