/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-only affiliate + promo engine.
 *
 * This module is the single place where commissions are created or reversed.
 * It is called from authenticated server functions and from the existing
 * PayMongo webhook route — no second billing truth is introduced.
 */
import {
  computeCommission,
  computeDiscount,
  isCycleEligible,
  round2,
  type CommissionDuration,
  type DiscountType,
  type PromoValidationError,
} from "@/lib/affiliate";

type Admin = any;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Collision-safe referral code (retries against the unique index). */
export async function generateReferralCode(admin: Admin, seed?: string): Promise<string> {
  const prefix = (seed ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);
  for (let i = 0; i < 12; i++) {
    const candidate = (prefix ? `${prefix}${randomCode(4)}` : randomCode(8)).slice(0, 16);
    const { data } = await admin
      .from("affiliate_partners")
      .select("id")
      .eq("referral_code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return randomCode(12);
}

export async function affiliateDefaults(admin: Admin) {
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "affiliate")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, any>;
  return {
    rate: Number(v["default_commission_rate"] ?? 20),
    duration: (v["default_commission_duration"] ?? "lifetime") as CommissionDuration,
    cookieDays: Number(v["cookie_days"] ?? 30),
  };
}

export async function partnerByCode(admin: Admin, code: string) {
  const { data } = await admin
    .from("affiliate_partners")
    .select("*")
    .ilike("referral_code", code.trim())
    .maybeSingle();
  return data ?? null;
}

/* ------------------------------------------------------------------ promo */

export type PromoCheck =
  | {
      ok: true;
      promo: any;
      originalAmount: number;
      discountAmount: number;
      finalAmount: number;
    }
  | { ok: false; error: PromoValidationError };

/**
 * Server-side promo validation. The client never computes a discount; it only
 * displays what this function returns.
 */
export async function validatePromoCode(
  admin: Admin,
  opts: { code: string; businessId: string; planSlug: string; amount: number },
): Promise<PromoCheck> {
  const code = opts.code.trim().toUpperCase();
  if (!code) return { ok: false, error: "not_found" };

  const { data: promo } = await admin
    .from("promo_codes")
    .select("*")
    .ilike("code", code)
    .maybeSingle();
  if (!promo) return { ok: false, error: "not_found" };
  if (!promo.active) return { ok: false, error: "inactive" };

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now)
    return { ok: false, error: "not_started" };
  if (promo.ends_at && new Date(promo.ends_at).getTime() < now)
    return { ok: false, error: "expired" };

  const plans: string[] = promo.applicable_plans ?? [];
  if (plans.length && !plans.includes(opts.planSlug))
    return { ok: false, error: "plan_not_eligible" };

  if (promo.min_amount != null && Number(opts.amount) < Number(promo.min_amount))
    return { ok: false, error: "below_minimum" };

  if (promo.max_redemptions != null && Number(promo.redemption_count) >= Number(promo.max_redemptions))
    return { ok: false, error: "limit_reached" };

  if (promo.max_per_business != null) {
    const { count } = await admin
      .from("promo_code_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("business_id", opts.businessId);
    if ((count ?? 0) >= Number(promo.max_per_business))
      return { ok: false, error: "business_limit_reached" };
  }

  const { discount, final } = computeDiscount(
    Number(opts.amount),
    promo.discount_type as DiscountType,
    Number(promo.discount_value),
  );
  return {
    ok: true,
    promo,
    originalAmount: round2(Number(opts.amount)),
    discountAmount: discount,
    finalAmount: final,
  };
}

/**
 * Persist the redemption plus a frozen snapshot of the applied discount, so
 * later edits to the promo code can never rewrite historical billing.
 */
export async function redeemPromoCode(
  admin: Admin,
  args: {
    check: Extract<PromoCheck, { ok: true }>;
    businessId: string;
    subscriptionId: string | null;
    planId: string | null;
    userId: string | null;
  },
) {
  const { promo, originalAmount, discountAmount, finalAmount } = args.check;

  await admin.from("promo_code_redemptions").insert({
    promo_code_id: promo.id,
    code: promo.code,
    business_id: args.businessId,
    subscription_id: args.subscriptionId,
    plan_id: args.planId,
    redeemed_by: args.userId,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    final_amount: finalAmount,
  });

  await admin
    .from("promo_codes")
    .update({ redemption_count: Number(promo.redemption_count ?? 0) + 1 })
    .eq("id", promo.id);

  // Retire any previous discount for this business before recording the new one.
  await admin
    .from("subscription_discounts")
    .update({ active: false })
    .eq("business_id", args.businessId)
    .eq("active", true);

  await admin.from("subscription_discounts").insert({
    business_id: args.businessId,
    subscription_id: args.subscriptionId,
    promo_code_id: promo.id,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_amount: discountAmount,
    original_amount: originalAmount,
    final_amount: finalAmount,
    duration: promo.duration,
  });

  // A promo code owned by a partner also attributes the business to them when
  // no referral-link attribution exists yet (deterministic: link wins).
  if (promo.affiliate_partner_id) {
    await attachReferral(admin, {
      businessId: args.businessId,
      userId: args.userId,
      partnerId: promo.affiliate_partner_id,
      referralCode: promo.code,
      promoCodeId: promo.id,
      source: "promo_code",
    });
  }
}

/* -------------------------------------------------------------- referrals */

/**
 * Attribution is persisted against the business row, not a cookie.
 * The first attribution wins — a business is never re-assigned to a new
 * partner, which keeps the commission ledger deterministic.
 */
export async function attachReferral(
  admin: Admin,
  args: {
    businessId: string;
    userId: string | null;
    partnerId: string;
    referralCode: string;
    promoCodeId?: string | null;
    source: "referral_link" | "promo_code" | "manual";
  },
) {
  const { data: existing } = await admin
    .from("affiliate_referrals")
    .select("id")
    .eq("business_id", args.businessId)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await admin
    .from("affiliate_referrals")
    .insert({
      partner_id: args.partnerId,
      business_id: args.businessId,
      user_id: args.userId,
      referral_code: args.referralCode,
      promo_code_id: args.promoCodeId ?? null,
      attribution_source: args.source,
      status: "signed_up",
    })
    .select("id")
    .maybeSingle();
  if (error && (error as any).code !== "23505") throw new Error(error.message);
  return (data?.id as string) ?? null;
}

export async function setReferralStatus(admin: Admin, businessId: string, status: string) {
  await admin
    .from("affiliate_referrals")
    .update({
      status,
      ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
    })
    .eq("business_id", businessId);
}

/* ------------------------------------------------------------ commissions */

/**
 * Create the commission ledger entry for a collected payment.
 *
 * - Idempotent: `external_reference` is unique per entry type, so a webhook
 *   replay can never double-pay a partner.
 * - Commission is calculated on NET collected revenue (after discount).
 * - Renewals increment `period_index`; the partner's configured duration
 *   decides when recurring commission stops.
 */
export async function recordCommissionForPayment(
  admin: Admin,
  args: {
    businessId: string;
    subscriptionId: string | null;
    collectedAmount: number;
    currency?: string;
    externalReference: string;
    paymentId?: string | null;
    invoiceId?: string | null;
    sourceType?: "payment" | "invoice";
  },
) {
  const collected = round2(Number(args.collectedAmount) || 0);
  if (collected <= 0) return null;

  const { data: referral } = await admin
    .from("affiliate_referrals")
    .select("*")
    .eq("business_id", args.businessId)
    .maybeSingle();
  if (!referral) return null;

  const { data: partner } = await admin
    .from("affiliate_partners")
    .select("*")
    .eq("id", referral.partner_id)
    .maybeSingle();
  if (!partner || partner.status !== "active") return null;

  const { count } = await admin
    .from("affiliate_commissions")
    .select("id", { count: "exact", head: true })
    .eq("referral_id", referral.id)
    .eq("entry_type", "earning");
  const periodIndex = (count ?? 0) + 1;

  if (!isCycleEligible(partner.commission_duration as CommissionDuration, periodIndex)) {
    return null;
  }

  // Discount actually applied to this business (frozen snapshot).
  const { data: discount } = await admin
    .from("subscription_discounts")
    .select("discount_amount")
    .eq("business_id", args.businessId)
    .eq("active", true)
    .maybeSingle();
  const discountAmount = round2(Number(discount?.discount_amount ?? 0));

  const rate = Number(partner.commission_rate ?? 0);
  const commission = computeCommission(collected, rate);

  const { error } = await admin.from("affiliate_commissions").insert({
    partner_id: partner.id,
    referral_id: referral.id,
    business_id: args.businessId,
    subscription_id: args.subscriptionId,
    payment_id: args.paymentId ?? null,
    invoice_id: args.invoiceId ?? null,
    source_type: args.sourceType ?? "payment",
    external_reference: args.externalReference,
    entry_type: "earning",
    gross_amount: round2(collected + discountAmount),
    discount_amount: discountAmount,
    net_amount: collected,
    commission_rate: rate,
    commission_amount: commission,
    currency: args.currency ?? "PHP",
    period_index: periodIndex,
    status: "pending",
  });
  // 23505 = replayed webhook delivery; already recorded.
  if (error && (error as any).code !== "23505") throw new Error(error.message);

  await admin
    .from("affiliate_referrals")
    .update({
      status: "active",
      first_paid_at: referral.first_paid_at ?? new Date().toISOString(),
    })
    .eq("id", referral.id);

  return commission;
}

/**
 * Refund / chargeback / reversal: the original entry is marked reversed and a
 * negative ledger entry is appended. Nothing is deleted.
 */
export async function reverseCommissionFor(
  admin: Admin,
  externalReference: string,
  note = "Payment reversed",
) {
  const { data: original } = await admin
    .from("affiliate_commissions")
    .select("*")
    .eq("external_reference", externalReference)
    .eq("entry_type", "earning")
    .maybeSingle();
  if (!original || original.status === "reversed") return null;

  const { error } = await admin.from("affiliate_commissions").insert({
    partner_id: original.partner_id,
    referral_id: original.referral_id,
    business_id: original.business_id,
    subscription_id: original.subscription_id,
    payment_id: original.payment_id,
    invoice_id: original.invoice_id,
    source_type: original.source_type,
    external_reference: externalReference,
    entry_type: "reversal",
    gross_amount: -Number(original.gross_amount),
    discount_amount: -Number(original.discount_amount),
    net_amount: -Number(original.net_amount),
    commission_rate: original.commission_rate,
    commission_amount: -Number(original.commission_amount),
    currency: original.currency,
    period_index: original.period_index,
    status: "reversed",
    reverses_id: original.id,
    note,
  });
  if (error && (error as any).code !== "23505") throw new Error(error.message);

  await admin
    .from("affiliate_commissions")
    .update({ status: "reversed", note })
    .eq("id", original.id);
  return true;
}

/** Aggregated partner balances derived from the ledger (never a stored total). */
export function summariseLedger(rows: any[]) {
  let lifetime = 0;
  let pending = 0;
  let paid = 0;
  let reversed = 0;
  for (const r of rows) {
    const amt = Number(r.commission_amount ?? 0);
    lifetime += amt;
    if (r.status === "paid") paid += amt;
    else if (r.status === "reversed") reversed += amt;
    else pending += amt;
  }
  return {
    lifetime: round2(lifetime),
    pending: round2(pending),
    paid: round2(paid),
    reversed: round2(reversed),
  };
}
