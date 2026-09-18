/**
 * Affiliate / referral + promo-code domain model (pure, client-safe).
 *
 * V1 rules:
 * - One level only: Affiliate Partner -> referred business -> subscription -> commission.
 * - Commission is earned on NET COLLECTED revenue (after any promo discount),
 *   and only once a payment is actually collected — never on a trial signup.
 * - Every commission movement is a ledger entry (earning / reversal / adjustment).
 */

export type PartnerStatus = "active" | "suspended" | "revoked";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type CommissionDuration = "lifetime" | "12_months" | "6_months" | "first_payment";
export type CommissionStatus = "pending" | "approved" | "reversed" | "paid" | "cancelled";
export type CommissionEntryType = "earning" | "reversal" | "adjustment";
export type PayoutStatus = "pending" | "processing" | "paid" | "failed" | "cancelled";
export type ReferralStatus =
  "clicked" | "signed_up" | "trialing" | "paid" | "active" | "past_due" | "cancelled";
export type DiscountType = "percentage" | "fixed";
export type PromoDuration = "first_payment" | "forever" | "12_months" | "6_months" | "3_months";

export const COMMISSION_DURATIONS: { value: CommissionDuration; label: string }[] = [
  { value: "lifetime", label: "Lifetime (every renewal)" },
  { value: "12_months", label: "First 12 months" },
  { value: "6_months", label: "First 6 months" },
  { value: "first_payment", label: "First payment only" },
];

export const PROMO_DURATIONS: { value: PromoDuration; label: string }[] = [
  { value: "first_payment", label: "First payment only" },
  { value: "3_months", label: "First 3 months" },
  { value: "6_months", label: "First 6 months" },
  { value: "12_months", label: "First 12 months" },
  { value: "forever", label: "Forever" },
];

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  clicked: "Clicked",
  signed_up: "Signed up",
  trialing: "Trial",
  paid: "Paid",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  reversed: "Reversed",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paid: "default",
  approved: "default",
  pending: "secondary",
  processing: "secondary",
  trialing: "secondary",
  signed_up: "outline",
  clicked: "outline",
  reversed: "destructive",
  past_due: "destructive",
  failed: "destructive",
  cancelled: "outline",
  suspended: "destructive",
  revoked: "destructive",
  rejected: "destructive",
};

/** Number of billing cycles a duration covers. `null` = unlimited. */
export function durationCycles(duration: CommissionDuration): number | null {
  switch (duration) {
    case "lifetime":
      return null;
    case "12_months":
      return 12;
    case "6_months":
      return 6;
    case "first_payment":
      return 1;
  }
}

export function promoDurationCycles(duration: PromoDuration): number | null {
  switch (duration) {
    case "forever":
      return null;
    case "12_months":
      return 12;
    case "6_months":
      return 6;
    case "3_months":
      return 3;
    case "first_payment":
      return 1;
  }
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Discount is always clamped to the order amount so a promo can never produce
 * a negative total.
 */
export function computeDiscount(
  amount: number,
  type: DiscountType,
  value: number,
): { discount: number; final: number } {
  const base = Math.max(0, Number(amount) || 0);
  const raw = type === "percentage" ? (base * Number(value)) / 100 : Number(value);
  const discount = round2(Math.min(Math.max(0, raw), base));
  return { discount, final: round2(base - discount) };
}

/** Commission on net collected revenue. */
export function computeCommission(netAmount: number, rate: number) {
  return round2((Math.max(0, netAmount) * Math.max(0, rate)) / 100);
}

/** Is a partner still eligible for a commission on cycle `periodIndex` (1-based)? */
export function isCycleEligible(duration: CommissionDuration, periodIndex: number) {
  const cycles = durationCycles(duration);
  return cycles === null || periodIndex <= cycles;
}

/** Referral URL for a code, e.g. https://app.example.com/r/AB12CD34 */
export function referralUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/r/${code}`;
}

export type PromoValidationError =
  | "not_found"
  | "inactive"
  | "not_started"
  | "expired"
  | "plan_not_eligible"
  | "limit_reached"
  | "business_limit_reached"
  | "below_minimum";

export const PROMO_ERROR_MESSAGE: Record<PromoValidationError, string> = {
  not_found: "That promo code doesn't exist.",
  inactive: "That promo code is no longer active.",
  not_started: "That promo code isn't active yet.",
  expired: "That promo code has expired.",
  plan_not_eligible: "That promo code can't be used on this plan.",
  limit_reached: "That promo code has reached its usage limit.",
  business_limit_reached: "You've already used this promo code.",
  below_minimum: "Your plan amount is below this code's minimum.",
};
