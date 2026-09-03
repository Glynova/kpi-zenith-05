import { describe, expect, it } from "vitest";

import {
  resolveAccess,
  type BillingSnapshot,
  type Plan,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/billing";

const plan = (slug: string, price: number): Plan => ({
  id: `plan-${slug}`,
  name: slug,
  slug,
  description: null,
  price,
  currency: "PHP",
  billing_interval: "month",
  trial_days: slug === "pro" ? 14 : 0,
  sort_order: 0,
  paymongo_plan_id: null,
});

const snapshot: BillingSnapshot = {
  plans: [plan("free", 0), plan("pro", 999), plan("business", 1999)],
  entitlements: [
    { plan_id: "plan-free", feature_key: "products", enabled: true, limit_value: null },
    { plan_id: "plan-free", feature_key: "purchase_orders", enabled: false, limit_value: null },
    { plan_id: "plan-free", feature_key: "max_users", enabled: true, limit_value: 2 },
    { plan_id: "plan-pro", feature_key: "products", enabled: true, limit_value: null },
    { plan_id: "plan-pro", feature_key: "purchase_orders", enabled: true, limit_value: null },
    { plan_id: "plan-pro", feature_key: "max_users", enabled: true, limit_value: 10 },
    { plan_id: "plan-business", feature_key: "max_users", enabled: true, limit_value: null },
  ],
  subscription: null,
};

const NOW = new Date("2026-01-15T00:00:00Z");

function sub(overrides: Partial<Subscription> & { status: SubscriptionStatus }): Subscription {
  return {
    id: "sub-1",
    business_id: "biz-1",
    plan_id: "plan-pro",
    paymongo_subscription_id: null,
    start_date: null,
    current_period_start: null,
    current_period_end: null,
    trial_ends_at: null,
    cancel_at_period_end: false,
    cancelled_at: null,
    pending_plan_id: null,
    pending_plan_effective_at: null,
    payment_method_brand: null,
    payment_method_last4: null,
    test_mode: true,
    ...overrides,
  };
}

describe("resolveAccess", () => {
  it("falls back to Free when there is no subscription row", () => {
    const a = resolveAccess(snapshot, NOW);
    expect(a.effectivePlan?.slug).toBe("free");
    expect(a.can("purchase_orders")).toBe(false);
    expect(a.can("products")).toBe(true);
  });

  it("grants full Pro entitlements during an active trial", () => {
    const a = resolveAccess(
      { ...snapshot, subscription: sub({ status: "trialing", trial_ends_at: "2026-01-22T00:00:00Z" }) },
      NOW,
    );
    expect(a.isTrialing).toBe(true);
    expect(a.trialDaysLeft).toBe(7);
    expect(a.can("purchase_orders")).toBe(true);
  });

  it("drops to Free entitlements when the trial has expired", () => {
    const a = resolveAccess(
      { ...snapshot, subscription: sub({ status: "trialing", trial_ends_at: "2026-01-01T00:00:00Z" }) },
      NOW,
    );
    expect(a.trialExpired).toBe(true);
    expect(a.effectivePlan?.slug).toBe("free");
    expect(a.can("purchase_orders")).toBe(false);
  });

  it("keeps paid entitlements while past_due but flags the warning", () => {
    const a = resolveAccess({ ...snapshot, subscription: sub({ status: "past_due" }) }, NOW);
    expect(a.pastDue).toBe(true);
    expect(a.readOnly).toBe(false);
    expect(a.can("purchase_orders")).toBe(true);
  });

  it("marks unpaid and suspended workspaces read-only on Free entitlements", () => {
    for (const status of ["unpaid", "suspended"] as SubscriptionStatus[]) {
      const a = resolveAccess({ ...snapshot, subscription: sub({ status }) }, NOW);
      expect(a.readOnly).toBe(true);
      expect(a.effectivePlan?.slug).toBe("free");
    }
  });

  it("treats cancelled as retained data on the Free plan", () => {
    const a = resolveAccess({ ...snapshot, subscription: sub({ status: "cancelled" }) }, NOW);
    expect(a.readOnly).toBe(false);
    expect(a.effectivePlan?.slug).toBe("free");
    expect(a.can("products")).toBe(true);
  });

  it("restores entitlements after resubscribing", () => {
    const a = resolveAccess({ ...snapshot, subscription: sub({ status: "active" }) }, NOW);
    expect(a.can("purchase_orders")).toBe(true);
  });
});

describe("limits", () => {
  it("enforces the Free seat cap", () => {
    const a = resolveAccess(snapshot, NOW);
    expect(a.limit("max_users")).toBe(2);
    expect(a.withinLimit("max_users", 1)).toBe(true);
    expect(a.withinLimit("max_users", 2)).toBe(false);
  });

  it("treats a null limit as unlimited", () => {
    const a = resolveAccess(
      { ...snapshot, subscription: sub({ status: "active", plan_id: "plan-business" }) },
      NOW,
    );
    expect(a.limit("max_users")).toBeNull();
    expect(a.withinLimit("max_users", 5000)).toBe(true);
  });

  it("reports zero for a limit the plan does not include", () => {
    const a = resolveAccess(snapshot, NOW);
    expect(a.limit("max_warehouses")).toBe(0);
    expect(a.withinLimit("max_warehouses", 0)).toBe(false);
  });
});
