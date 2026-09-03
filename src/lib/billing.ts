/**
 * Subscription / entitlement model.
 *
 * PLAN -> ENTITLEMENTS -> FEATURE + LIMIT ACCESS
 *
 * Role permissions answer "what may this *user* do".
 * Entitlements answer "does this *business* have the capability at all".
 * The two systems stay independent: a route is usable only when both allow it.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "suspended"
  | "incomplete";

export type PlanSlug = "free" | "pro" | "business";

export type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  billing_interval: string;
  trial_days: number;
  sort_order: number;
  paymongo_plan_id: string | null;
};

export type Entitlement = {
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
};

export type Subscription = {
  id: string;
  business_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  paymongo_subscription_id: string | null;
  start_date: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  pending_plan_id: string | null;
  pending_plan_effective_at: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  test_mode: boolean;
};

/** Every capability the app can gate on. */
export const FEATURE_KEYS = [
  "dashboard",
  "products",
  "inventory",
  "customers",
  "suppliers",
  "sales",
  "expenses",
  "basic_reports",
  "purchase_orders",
  "bom",
  "invoices",
  "cash_flow",
  "ar_ap",
  "advanced_reports",
  "payroll",
  "analytics",
  "audit_logs",
  "advanced_inventory",
  "multi_warehouse",
  "multi_branch",
  "advanced_permissions",
  "consolidated_reports",
  "api_access",
  "priority_support",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = ["max_users", "max_businesses", "max_products", "max_warehouses"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export const FEATURE_LABEL: Record<string, string> = {
  dashboard: "Dashboard",
  products: "Products",
  inventory: "Inventory",
  customers: "Customers",
  suppliers: "Suppliers",
  sales: "Sales",
  expenses: "Expenses",
  basic_reports: "Basic reports",
  purchase_orders: "Purchase orders",
  bom: "BOM / recipe costing",
  invoices: "Invoices",
  cash_flow: "Cash flow",
  ar_ap: "Receivables & payables",
  advanced_reports: "Advanced reports",
  payroll: "Employees & payroll",
  analytics: "KPI analytics",
  audit_logs: "Audit logs",
  advanced_inventory: "Advanced inventory",
  multi_warehouse: "Multiple warehouses",
  multi_branch: "Multiple branches",
  advanced_permissions: "Advanced permissions",
  consolidated_reports: "Consolidated reporting",
  api_access: "API & integrations",
  priority_support: "Priority support",
  max_users: "Team members",
  max_businesses: "Businesses",
  max_products: "Products",
  max_warehouses: "Warehouses",
};

/** Which entitlement (if any) a route requires. Routes not listed are always available. */
export const ROUTE_FEATURE: Record<string, FeatureKey> = {
  "/purchase-orders": "purchase_orders",
  "/invoices": "invoices",
  "/cash-flow": "cash_flow",
  "/receivables": "ar_ap",
  "/payables": "ar_ap",
  "/employees": "payroll",
  "/attendance": "payroll",
  "/payroll": "payroll",
  "/analytics": "analytics",
  "/audit-logs": "audit_logs",
  "/batches": "advanced_inventory",
  "/serials": "advanced_inventory",
  "/variants": "advanced_inventory",
  "/stock-counts": "advanced_inventory",
  "/transfers": "multi_warehouse",
  "/locations": "multi_warehouse",
};

/** Statuses where the business keeps the entitlements of its paid plan. */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due"];

/** Statuses where new operational transactions are blocked (data is never removed). */
export const READ_ONLY_STATUSES: SubscriptionStatus[] = ["unpaid", "suspended"];

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  unpaid: "Unpaid",
  cancelled: "Cancelled",
  suspended: "Suspended",
  incomplete: "Incomplete",
};

export const STATUS_TONE: Record<SubscriptionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  trialing: "secondary",
  active: "default",
  past_due: "destructive",
  unpaid: "destructive",
  cancelled: "outline",
  suspended: "destructive",
  incomplete: "outline",
};

export type BillingSnapshot = {
  plans: Plan[];
  entitlements: Entitlement[];
  subscription: Subscription | null;
};

export type ResolvedAccess = {
  status: SubscriptionStatus;
  /** Plan the business pays for (or trials). */
  plan: Plan | null;
  /** Plan whose entitlements are actually being applied right now. */
  effectivePlan: Plan | null;
  trialDaysLeft: number | null;
  isTrialing: boolean;
  trialExpired: boolean;
  /** unpaid / suspended -> operational writes blocked, data still readable. */
  readOnly: boolean;
  pastDue: boolean;
  can: (key: FeatureKey) => boolean;
  limit: (key: LimitKey) => number | null;
  withinLimit: (key: LimitKey, current: number) => boolean;
};

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

export function entitlementsFor(snapshot: BillingSnapshot, planId: string | undefined | null) {
  const map = new Map<string, Entitlement>();
  if (!planId) return map;
  for (const e of snapshot.entitlements) {
    if (e.plan_id === planId) map.set(e.feature_key, e);
  }
  return map;
}

export function planBySlug(plans: Plan[], slug: PlanSlug) {
  return plans.find((p) => p.slug === slug) ?? null;
}

/**
 * Single source of truth for what a business may use right now.
 *
 * - No subscription row at all -> Free plan.
 * - trialing / active / past_due -> the subscribed plan's entitlements.
 * - Expired trial, cancelled, unpaid, suspended, incomplete -> Free entitlements
 *   (data stays intact; unpaid/suspended additionally block new transactions).
 */
export function resolveAccess(snapshot: BillingSnapshot, now: Date = new Date()): ResolvedAccess {
  const free = planBySlug(snapshot.plans, "free");
  const sub = snapshot.subscription;
  const plan = sub ? (snapshot.plans.find((p) => p.id === sub.plan_id) ?? free) : free;
  const status: SubscriptionStatus = sub?.status ?? "active";

  const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const isTrialing = status === "trialing" && !!trialEnds && trialEnds > now;
  const trialExpired = status === "trialing" && !!trialEnds && trialEnds <= now;
  const trialDaysLeft = trialEnds && isTrialing ? Math.max(0, daysBetween(now, trialEnds)) : null;

  const entitled = ENTITLED_STATUSES.includes(status) && !trialExpired;
  const effectivePlan = entitled ? plan : free;
  const map = entitlementsFor(snapshot, effectivePlan?.id);

  const can = (key: FeatureKey) => map.get(key)?.enabled ?? false;
  const limit = (key: LimitKey) => {
    const row = map.get(key);
    if (!row || !row.enabled) return 0;
    return row.limit_value ?? null; // null = unlimited
  };

  return {
    status,
    plan,
    effectivePlan,
    trialDaysLeft,
    isTrialing,
    trialExpired,
    readOnly: READ_ONLY_STATUSES.includes(status),
    pastDue: status === "past_due",
    can,
    limit,
    withinLimit: (key, current) => {
      const max = limit(key);
      return max === null ? true : current < max;
    },
  };
}

export function formatPHP(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatMoney(amount: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Marketing copy for the pricing page and plan comparison, keyed by slug. */
export const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free: [
    "1 business",
    "Up to 2 team members",
    "Dashboard, Products & Inventory",
    "Customers & Suppliers",
    "Sales & Expenses",
    "Basic reports",
  ],
  pro: [
    "Everything in Free",
    "Unlimited products",
    "Advanced inventory & multiple warehouses",
    "Purchase orders & supplier engine",
    "BOM / recipe costing",
    "Invoices, cash flow, AR/AP",
    "Payroll & employees",
    "KPI analytics, advanced reports, audit logs",
    "Up to 10 team members",
  ],
  business: [
    "Everything in Pro",
    "Multiple branches",
    "Advanced permissions",
    "Consolidated reporting",
    "API & integrations",
    "Unlimited team members",
    "Priority support",
  ],
};
