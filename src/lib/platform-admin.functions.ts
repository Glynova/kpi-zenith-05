/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform (SaaS) admin server functions.
 *
 * Every handler re-verifies platform-admin membership through the caller's own
 * authenticated client before the service-role client is loaded. Route
 * placement alone never grants access.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requirePlatformAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [
      { count: businesses },
      { count: users },
      { data: subs },
      { data: plans },
      { data: commissions },
      { data: referrals },
    ] = await Promise.all([
      admin.from("businesses").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("subscriptions").select("id, business_id, plan_id, status"),
      admin.from("subscription_plans").select("id, slug, name, price"),
      admin.from("affiliate_commissions").select("commission_amount, status, business_id"),
      admin.from("affiliate_referrals").select("business_id"),
    ]);

    const planMap = new Map<string, any>((plans ?? []).map((p: any) => [p.id, p]));
    const priceOf = (s: any) => Number(planMap.get(s.plan_id)?.price ?? 0);
    const active = (subs ?? []).filter((s: any) => s.status === "active");
    const mrr = active.reduce((sum: number, s: any) => sum + priceOf(s), 0);
    const referredIds = new Set((referrals ?? []).map((r: any) => r.business_id));
    const affiliateMrr = active
      .filter((s: any) => referredIds.has(s.business_id))
      .reduce((sum: number, s: any) => sum + priceOf(s), 0);
    const pendingCommissions = (commissions ?? [])
      .filter((c: any) => c.status === "pending" || c.status === "approved")
      .reduce((s: number, c: any) => s + Number(c.commission_amount ?? 0), 0);

    return {
      businesses: businesses ?? 0,
      users: users ?? 0,
      activeSubscriptions: active.length,
      trials: (subs ?? []).filter((s: any) => s.status === "trialing").length,
      pastDue: (subs ?? []).filter((s: any) => ["past_due", "unpaid"].includes(s.status)).length,
      mrr: Math.round(mrr * 100) / 100,
      affiliateMrr: Math.round(affiliateMrr * 100) / 100,
      pendingCommissions: Math.round(pendingCommissions * 100) / 100,
      referredBusinesses: referredIds.size,
    };
  });

export const adminBusinesses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [{ data: businesses }, { data: subs }, { data: plans }, { data: members }] =
      await Promise.all([
        admin.from("businesses").select("*").order("created_at", { ascending: false }).limit(500),
        admin.from("subscriptions").select("business_id, status, plan_id, trial_ends_at, current_period_end"),
        admin.from("subscription_plans").select("id, name, slug, price"),
        admin.from("user_businesses").select("business_id, user_id, role, status"),
      ]);
    const planMap = new Map<string, any>((plans ?? []).map((p: any) => [p.id, p]));
    const subMap = new Map<string, any>((subs ?? []).map((s: any) => [s.business_id, s]));
    return {
      businesses: (businesses ?? []).map((b: any) => {
        const s = subMap.get(b.id);
        return {
          ...b,
          status: s?.status ?? "free",
          plan: planMap.get(s?.plan_id)?.name ?? "Free",
          price: Number(planMap.get(s?.plan_id)?.price ?? 0),
          trial_ends_at: s?.trial_ends_at ?? null,
          current_period_end: s?.current_period_end ?? null,
          members: (members ?? []).filter((m: any) => m.business_id === b.id).length,
        };
      }),
    };
  });

export const adminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [{ data: profiles }, { data: memberships }, { data: businesses }] = await Promise.all([
      admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
      admin.from("user_businesses").select("user_id, business_id, role, status"),
      admin.from("businesses").select("id, name"),
    ]);
    const bizMap = new Map<string, string>((businesses ?? []).map((b: any) => [b.id, b.name]));
    return {
      users: (profiles ?? []).map((p: any) => ({
        ...p,
        memberships: (memberships ?? [])
          .filter((m: any) => m.user_id === p.id)
          .map((m: any) => ({ ...m, business_name: bizMap.get(m.business_id) ?? "—" })),
      })),
    };
  });

export const adminSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [{ data: subs }, { data: plans }, { data: businesses }, { data: payments }, { data: invoices }] =
      await Promise.all([
        admin.from("subscriptions").select("*").order("created_at", { ascending: false }),
        admin.from("subscription_plans").select("*").order("sort_order"),
        admin.from("businesses").select("id, name"),
        admin
          .from("subscription_payments")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        admin.from("billing_invoices").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
    const bizMap = new Map<string, string>((businesses ?? []).map((b: any) => [b.id, b.name]));
    const planMap = new Map<string, any>((plans ?? []).map((p: any) => [p.id, p]));
    return {
      subscriptions: (subs ?? []).map((s: any) => ({
        ...s,
        business_name: bizMap.get(s.business_id) ?? "—",
        plan_name: planMap.get(s.plan_id)?.name ?? "—",
        plan_price: Number(planMap.get(s.plan_id)?.price ?? 0),
      })),
      plans: plans ?? [],
      payments: (payments ?? []).map((p: any) => ({ ...p, business_name: bizMap.get(p.business_id) ?? "—" })),
      invoices: (invoices ?? []).map((i: any) => ({ ...i, business_name: bizMap.get(i.business_id) ?? "—" })),
    };
  });

export const adminEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [{ data: events }, { data: businesses }, { data: logs }] = await Promise.all([
      admin
        .from("subscription_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      admin.from("businesses").select("id, name"),
      admin.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    const bizMap = new Map<string, string>((businesses ?? []).map((b: any) => [b.id, b.name]));
    return {
      events: (events ?? []).map((e: any) => ({ ...e, business_name: bizMap.get(e.business_id) ?? "—" })),
      auditLogs: (logs ?? []).map((l: any) => ({ ...l, business_name: bizMap.get(l.business_id) ?? "—" })),
    };
  });

/* ------------------------------------------------------------- affiliates */

export const adminAffiliates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [{ data: applications }, { data: partners }, { data: referrals }, { data: commissions }, { data: payouts }, { data: settings }] =
      await Promise.all([
        admin.from("affiliate_applications").select("*").order("created_at", { ascending: false }),
        admin.from("affiliate_partners").select("*").order("created_at", { ascending: false }),
        admin.from("affiliate_referrals").select("*"),
        admin.from("affiliate_commissions").select("*").order("created_at", { ascending: false }).limit(500),
        admin.from("affiliate_payouts").select("*").order("created_at", { ascending: false }),
        admin.from("platform_settings").select("value").eq("key", "affiliate").maybeSingle(),
      ]);

    const byPartner = (id: string) => (commissions ?? []).filter((c: any) => c.partner_id === id);
    return {
      applications: applications ?? [],
      partners: (partners ?? []).map((p: any) => {
        const rows = byPartner(p.id);
        const earned = rows.reduce((s: number, c: any) => s + Number(c.commission_amount ?? 0), 0);
        const unpaid = rows
          .filter((c: any) => c.status === "pending" || c.status === "approved")
          .reduce((s: number, c: any) => s + Number(c.commission_amount ?? 0), 0);
        const refs = (referrals ?? []).filter((r: any) => r.partner_id === p.id);
        return {
          ...p,
          referral_count: refs.length,
          active_count: refs.filter((r: any) => r.status === "active").length,
          attributed_revenue:
            Math.round(rows.reduce((s: number, c: any) => s + Number(c.net_amount ?? 0), 0) * 100) / 100,
          lifetime_commission: Math.round(earned * 100) / 100,
          payout_balance: Math.round(unpaid * 100) / 100,
        };
      }),
      referrals: referrals ?? [],
      commissions: commissions ?? [],
      payouts: payouts ?? [],
      defaults: (settings?.value ?? {}) as Record<string, any>,
    };
  });

export const reviewAffiliateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(1000).optional(),
        commissionRate: z.number().min(0).max(100).optional(),
        commissionDuration: z
          .enum(["lifetime", "12_months", "6_months", "first_payment"])
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const { data: application } = await admin
      .from("affiliate_applications")
      .select("*")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application) throw new Error("Application not found");

    await admin
      .from("affiliate_applications")
      .update({
        status: data.decision,
        review_notes: data.notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.applicationId);

    if (data.decision !== "approved") return { ok: true, partnerId: null };

    const { data: existing } = await admin
      .from("affiliate_partners")
      .select("id")
      .eq("user_id", application.user_id)
      .maybeSingle();
    if (existing) return { ok: true, partnerId: existing.id as string };

    const { affiliateDefaults, generateReferralCode } = await import("@/lib/affiliate.server");
    const defaults = await affiliateDefaults(admin);
    const code = await generateReferralCode(admin, application.full_name);
    const { data: partner, error } = await admin
      .from("affiliate_partners")
      .insert({
        user_id: application.user_id,
        application_id: application.id,
        display_name: application.full_name,
        email: application.email,
        company: application.company,
        website: application.website,
        referral_code: code,
        commission_rate: data.commissionRate ?? defaults.rate,
        commission_duration: data.commissionDuration ?? defaults.duration,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, partnerId: partner?.id as string };
  });

export const updateAffiliatePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        partnerId: z.string().uuid(),
        status: z.enum(["active", "suspended", "revoked"]).optional(),
        commissionRate: z.number().min(0).max(100).optional(),
        commissionDuration: z
          .enum(["lifetime", "12_months", "6_months", "first_payment"])
          .optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const patch: Record<string, any> = {};
    if (data.status) patch["status"] = data.status;
    if (data.commissionRate != null) patch["commission_rate"] = data.commissionRate;
    if (data.commissionDuration) patch["commission_duration"] = data.commissionDuration;
    if (data.notes != null) patch["notes"] = data.notes;
    const { error } = await admin.from("affiliate_partners").update(patch).eq("id", data.partnerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAffiliateDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rate: z.number().min(0).max(100),
        duration: z.enum(["lifetime", "12_months", "6_months", "first_payment"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const { error } = await admin.from("platform_settings").upsert(
      {
        key: "affiliate",
        value: { default_commission_rate: data.rate, default_commission_duration: data.duration },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCommissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        commissionIds: z.array(z.string().uuid()).min(1),
        status: z.enum(["pending", "approved", "paid", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const { error } = await admin
      .from("affiliate_commissions")
      .update({ status: data.status })
      .in("id", data.commissionIds)
      .neq("status", "reversed");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Creates a payout batch from a partner's approved/pending commissions. */
export const createAffiliatePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ partnerId: z.string().uuid(), notes: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const { data: rows } = await admin
      .from("affiliate_commissions")
      .select("id, commission_amount, currency")
      .eq("partner_id", data.partnerId)
      .is("payout_id", null)
      .in("status", ["pending", "approved"]);
    const list = (rows ?? []) as any[];
    if (!list.length) throw new Error("No unpaid commissions for this partner");
    const amount =
      Math.round(list.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0) * 100) / 100;
    if (amount <= 0) throw new Error("Payout balance is zero");

    const { data: payout, error } = await admin
      .from("affiliate_payouts")
      .insert({
        partner_id: data.partnerId,
        amount,
        currency: list[0]?.currency ?? "PHP",
        status: "pending",
        notes: data.notes ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await admin
      .from("affiliate_commissions")
      .update({ payout_id: payout.id, status: "approved" })
      .in(
        "id",
        list.map((r) => r.id),
      );
    return { ok: true, payoutId: payout.id as string, amount };
  });

export const updateAffiliatePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payoutId: z.string().uuid(),
        status: z.enum(["pending", "processing", "paid", "failed", "cancelled"]),
        reference: z.string().max(120).optional(),
        method: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const paid = data.status === "paid";
    const { error } = await admin
      .from("affiliate_payouts")
      .update({
        status: data.status,
        reference: data.reference ?? null,
        method: data.method ?? null,
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    if (paid) {
      await admin
        .from("affiliate_commissions")
        .update({ status: "paid" })
        .eq("payout_id", data.payoutId)
        .neq("status", "reversed");
    }
    return { ok: true };
  });

/* ------------------------------------------------------------ promo codes */

const promoInput = z.object({
  code: z.string().min(3).max(40),
  description: z.string().max(300).optional(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().positive(),
  duration: z.enum(["first_payment", "forever", "12_months", "6_months", "3_months"]),
  applicablePlans: z.array(z.enum(["free", "pro", "business"])).default([]),
  minAmount: z.number().min(0).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  maxPerBusiness: z.number().int().min(1).default(1),
  active: z.boolean().default(true),
  affiliatePartnerId: z.string().uuid().nullable().optional(),
});

export const adminPromoCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await requirePlatformAdmin(context);
    const [{ data: codes }, { data: redemptions }, { data: partners }] = await Promise.all([
      admin.from("promo_codes").select("*").order("created_at", { ascending: false }),
      admin
        .from("promo_code_redemptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      admin.from("affiliate_partners").select("id, display_name, referral_code"),
    ]);
    return { codes: codes ?? [], redemptions: redemptions ?? [], partners: partners ?? [] };
  });

export const upsertPromoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    promoInput.extend({ id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const row = {
      code: data.code.trim().toUpperCase(),
      description: data.description ?? null,
      discount_type: data.discountType,
      discount_value: data.discountValue,
      duration: data.duration,
      applicable_plans: data.applicablePlans,
      min_amount: data.minAmount ?? null,
      starts_at: data.startsAt || null,
      ends_at: data.endsAt || null,
      max_redemptions: data.maxRedemptions ?? null,
      max_per_business: data.maxPerBusiness,
      active: data.active,
      affiliate_partner_id: data.affiliatePartnerId ?? null,
      created_by: context.userId,
    };
    if (data.discountType === "percentage" && data.discountValue > 100) {
      throw new Error("A percentage discount cannot exceed 100%");
    }
    const query = data.id
      ? admin.from("promo_codes").update(row).eq("id", data.id)
      : admin.from("promo_codes").insert(row);
    const { error } = await query;
    if (error) {
      if ((error as any).code === "23505") throw new Error("That code already exists");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const setPromoCodeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requirePlatformAdmin(context);
    const { error } = await admin.from("promo_codes").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
