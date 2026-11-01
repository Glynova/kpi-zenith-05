/**
 * Single source of truth for KPI maths.
 *
 * Every screen (dashboard, analytics, reports) must use these helpers so the
 * same number never has two definitions. Rules encoded here:
 *
 * - Only posted sales count. Quotes, sales orders, drafts, voided and
 *   cancelled documents are excluded — they are commitments, not revenue.
 * - Returns subtract. A return document carries positive amounts, so its sign
 *   is flipped for revenue and its (already negative) cost is flipped back.
 * - Revenue is net of tax, shipping and other charges. Tax collected for the
 *   government and freight recharges are not margin.
 * - Inventory is valued at average (actual) cost when known, falling back to
 *   the entered cost price.
 */
import type { Row } from "@/lib/db";
import { addCalendarDays, dateInTimeZone } from "@/lib/date-range";

const EXCLUDED_STATUSES = new Set(["draft", "voided", "cancelled", "rejected", "expired"]);
const NON_REVENUE_DOCS = new Set(["quote", "sales_order"]);

export function isPostedSale(sale: Row): boolean {
  if (NON_REVENUE_DOCS.has(String(sale.document_type ?? "sale"))) return false;
  if (EXCLUDED_STATUSES.has(String(sale.status ?? ""))) return false;
  if (
    sale.document_type === "pos_sale" &&
    (sale.inventory_posted !== true || sale.status !== "completed")
  ) {
    return false;
  }
  // inventory_posted is set by complete_sale()/post_sales_return(); rows that
  // predate it fall back to their status.
  if (sale.inventory_posted === false && sale.status !== "completed") return false;
  return true;
}

/** Returns reverse revenue and cost. */
export function saleSign(sale: Row): number {
  return String(sale.document_type ?? "") === "return" ? -1 : 1;
}

export type SalesMetrics = {
  /** Net revenue: excludes tax, shipping and other charges. */
  revenue: number;
  /** What the customer paid in total, tax included. */
  grossSales: number;
  tax: number;
  discount: number;
  cogs: number;
  grossProfit: number;
  orders: number;
  aov: number;
};

export function salesMetrics(sales: Row[]): SalesMetrics {
  let revenue = 0;
  let grossSales = 0;
  let tax = 0;
  let discount = 0;
  let cogs = 0;
  let orders = 0;

  for (const s of sales) {
    if (!isPostedSale(s)) continue;
    const sign = saleSign(s);
    const total = Number(s.total ?? 0);
    const t = Number(s.tax ?? 0);
    const extras = Number(s.shipping ?? 0) + Number(s.other_charges ?? 0);
    revenue += sign * (total - t - extras);
    grossSales += sign * total;
    tax += sign * t;
    discount += sign * Number(s.discount ?? 0);
    // cost_total is stored negative on returns, so the sign flip restores it.
    cogs += sign * Number(s.cost_total ?? 0);
    if (sign > 0) orders += 1;
  }

  const grossProfit = revenue - cogs;
  return {
    revenue: round2(revenue),
    grossSales: round2(grossSales),
    tax: round2(tax),
    discount: round2(discount),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    orders,
    aov: orders ? round2(revenue / orders) : 0,
  };
}

/** Net revenue of a single sale — used for time series and customer ranking. */
export function saleNetRevenue(sale: Row): number {
  if (!isPostedSale(sale)) return 0;
  return (
    saleSign(sale) *
    (Number(sale.total ?? 0) -
      Number(sale.tax ?? 0) -
      Number(sale.shipping ?? 0) -
      Number(sale.other_charges ?? 0))
  );
}

/** Stock value at actual cost, falling back to the entered cost price. */
export function inventoryValueOf(products: Row[]): number {
  return round2(
    products.reduce(
      (a, p) => a + Number(p.stock ?? 0) * Number(p.average_cost || p.cost_price || 0),
      0,
    ),
  );
}

export function marginPercent(profit: number, revenue: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

export type BusinessHealthProfileKey =
  | "retail"
  | "pharmacy"
  | "restaurant"
  | "manufacturer"
  | "construction"
  | "services"
  | "sme_default";

type HealthComponentKey =
  "profitability" | "growth_activity" | "cash_flow" | "liquidity" | "inventory_health";

type HealthProfile = {
  targetNetMargin: number;
  weights: Record<HealthComponentKey, number>;
  applies: Record<HealthComponentKey, boolean>;
};

const INVENTORY_WEIGHTS = {
  profitability: 30,
  growth_activity: 15,
  cash_flow: 20,
  liquidity: 20,
  inventory_health: 15,
} satisfies Record<HealthComponentKey, number>;

/** Tune the score thresholds, windows, classifications, and profiles here. */
export const BUSINESS_HEALTH_CONFIG = {
  defaultProfile: "sme_default" as BusinessHealthProfileKey,
  labels: { healthy: 75, watch: 50 },
  periods: {
    growthDays: 30,
    inventorySalesDays: 90,
    deadStockDays: 180,
    payablesDueDays: 60,
    pharmacyNearExpiryDays: 60,
  },
  profitability: { floor: -0.05 },
  growth: { severeDecline: -0.3, flat: 0, strongGrowth: 0.1, flatScore: 0.6 },
  cashFlow: {
    severeDeficit: -0.1,
    zero: 0,
    target: 0.05,
    zeroScore: 0.5,
    rollingProfiles: ["manufacturer", "construction"] as BusinessHealthProfileKey[],
    excludedCashPatterns: [
      "loan proceeds",
      "loan",
      "owner capital",
      "capital",
      "equity",
      "owner",
      "capital contribution",
      "owner contribution",
      "opening balance",
      "transfer",
      "financing",
    ],
  },
  liquidity: { zero: 0, one: 1, target: 1.5, oneScore: 0.7 },
  inventory: {
    negativeStockPenalty: 0.25,
    deadStockPenalty: 0.25,
    pharmacyExpiryPenalty: 0.25,
  },
  profiles: {
    retail: {
      targetNetMargin: 0.05,
      weights: INVENTORY_WEIGHTS,
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: true,
      },
    },
    pharmacy: {
      targetNetMargin: 0.05,
      weights: INVENTORY_WEIGHTS,
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: true,
      },
    },
    restaurant: {
      targetNetMargin: 0.08,
      weights: INVENTORY_WEIGHTS,
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: true,
      },
    },
    manufacturer: {
      targetNetMargin: 0.1,
      weights: INVENTORY_WEIGHTS,
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: true,
      },
    },
    construction: {
      targetNetMargin: 0.08,
      weights: INVENTORY_WEIGHTS,
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: true,
      },
    },
    services: {
      targetNetMargin: 0.15,
      weights: {
        profitability: 35.3,
        growth_activity: 17.6,
        cash_flow: 23.5,
        liquidity: 23.6,
        inventory_health: 0,
      },
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: false,
      },
    },
    sme_default: {
      targetNetMargin: 0.1,
      weights: INVENTORY_WEIGHTS,
      applies: {
        profitability: true,
        growth_activity: true,
        cash_flow: true,
        liquidity: true,
        inventory_health: true,
      },
    },
  } satisfies Record<BusinessHealthProfileKey, HealthProfile>,
} as const;

export type InventoryHealthInput = {
  inStockRate: number;
  negativeStockShare: number;
  deadStockShare: number;
  expiryRiskShare?: number;
  hasExpiryData?: boolean;
};

export type BusinessHealthInput = {
  businessType?: string | null;
  netMargin: number;
  revenue: number;
  previousRevenue: number;
  hasPreviousPeriod: boolean;
  operatingCashFlow: number;
  cashFlowRevenue?: number;
  cash: number;
  receivables: number;
  payablesDue: number;
  hasSalesHistory: boolean;
  hasExpensesInPeriod: boolean;
  inventory?: InventoryHealthInput;
};

export type BusinessHealthComponent = {
  key: HealthComponentKey;
  label: string;
  points: number;
  maxPoints: number;
  value: number | null;
  explanation: string;
};

export type BusinessHealthResult = {
  score: number | null;
  label: "Healthy" | "Watch" | "At risk" | "Insufficient data";
  components: BusinessHealthComponent[];
  state: "ready" | "insufficient_data";
  notes: string[];
};

const HEALTH_COMPONENT_LABELS: Record<HealthComponentKey, string> = {
  profitability: "Profitability",
  growth_activity: "Growth / activity",
  cash_flow: "Operating cash flow",
  liquidity: "Liquidity",
  inventory_health: "Inventory health",
};

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function interpolate(value: number, x1: number, y1: number, x2: number, y2: number) {
  return y1 + ((value - x1) / (x2 - x1)) * (y2 - y1);
}

function resolveHealthProfile(type?: string | null): BusinessHealthProfileKey {
  switch (String(type ?? "").toLowerCase()) {
    case "retail":
    case "grocery":
    case "wholesale":
    case "ecommerce":
    case "clothing":
    case "electronics":
    case "automotive":
    case "agriculture":
    case "distribution":
      return "retail";
    case "pharmacy":
      return "pharmacy";
    case "restaurant":
      return "restaurant";
    case "manufacturer":
    case "manufacturing":
      return "manufacturer";
    case "construction":
      return "construction";
    case "services":
      return "services";
    default:
      return BUSINESS_HEALTH_CONFIG.defaultProfile;
  }
}

function growthFactor(input: BusinessHealthInput): number {
  const config = BUSINESS_HEALTH_CONFIG.growth;
  if (input.revenue <= 0) return 0;
  if (!input.hasPreviousPeriod || input.previousRevenue <= 0) return config.flatScore;
  const growth = (input.revenue - input.previousRevenue) / input.previousRevenue;
  if (growth <= config.severeDecline) return 0;
  if (growth < config.flat) {
    return interpolate(growth, config.severeDecline, 0, config.flat, config.flatScore);
  }
  if (growth < config.strongGrowth) {
    return interpolate(growth, config.flat, config.flatScore, config.strongGrowth, 1);
  }
  return 1;
}

function cashFlowFactor(ratio: number): number {
  const config = BUSINESS_HEALTH_CONFIG.cashFlow;
  if (ratio <= config.severeDeficit) return 0;
  if (ratio < config.zero)
    return interpolate(ratio, config.severeDeficit, 0, config.zero, config.zeroScore);
  if (ratio < config.target)
    return interpolate(ratio, config.zero, config.zeroScore, config.target, 1);
  return 1;
}

function liquidityFactor(ratio: number): number {
  const config = BUSINESS_HEALTH_CONFIG.liquidity;
  if (ratio <= config.zero) return 0;
  if (ratio < config.one) return interpolate(ratio, config.zero, 0, config.one, config.oneScore);
  if (ratio < config.target)
    return interpolate(ratio, config.one, config.oneScore, config.target, 1);
  return 1;
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

/** Calculates the shared, profile-aware business health score. */
export function healthScore(input: BusinessHealthInput): BusinessHealthResult {
  const notes: string[] = [];
  if (!input.hasSalesHistory) notes.push("No posted sales history is available yet.");
  if (!input.hasExpensesInPeriod) {
    notes.push(
      `No expenses are recorded in the last ${BUSINESS_HEALTH_CONFIG.periods.growthDays} days.`,
    );
  }
  if (notes.length) {
    return {
      score: null,
      label: "Insufficient data",
      components: [],
      state: "insufficient_data",
      notes,
    };
  }

  const profileKey = resolveHealthProfile(input.businessType);
  const profile = BUSINESS_HEALTH_CONFIG.profiles[profileKey];
  const margin = input.revenue > 0 ? input.netMargin : 0;
  const profitability = clamp(
    (margin - BUSINESS_HEALTH_CONFIG.profitability.floor) /
      (profile.targetNetMargin - BUSINESS_HEALTH_CONFIG.profitability.floor),
  );
  const activity = growthFactor(input);
  const cashFlowRevenue = input.cashFlowRevenue ?? input.revenue;
  const operatingCashRatio = cashFlowRevenue > 0 ? input.operatingCashFlow / cashFlowRevenue : 0;
  const cashFlow = cashFlowFactor(operatingCashRatio);
  const liquidityRatio =
    input.payablesDue > 0 ? (input.cash + input.receivables) / input.payablesDue : null;
  const liquidity = liquidityRatio === null ? 1 : liquidityFactor(liquidityRatio);
  const inventory = input.inventory;
  const inventoryFactor = inventory
    ? clamp(
        inventory.inStockRate -
          inventory.negativeStockShare * BUSINESS_HEALTH_CONFIG.inventory.negativeStockPenalty -
          inventory.deadStockShare * BUSINESS_HEALTH_CONFIG.inventory.deadStockPenalty -
          (profileKey === "pharmacy" && inventory.hasExpiryData
            ? (inventory.expiryRiskShare ?? 0) *
              BUSINESS_HEALTH_CONFIG.inventory.pharmacyExpiryPenalty
            : 0),
      )
    : 0;

  const raw: Record<
    HealthComponentKey,
    { factor: number; value: number | null; explanation: string }
  > = {
    profitability: {
      factor: profitability,
      value: margin,
      explanation: `${percent(margin)} net margin; profile target ${percent(profile.targetNetMargin)}.`,
    },
    growth_activity: {
      factor: activity,
      value:
        input.revenue > 0 && input.previousRevenue > 0 && input.hasPreviousPeriod
          ? (input.revenue - input.previousRevenue) / input.previousRevenue
          : null,
      explanation:
        input.revenue <= 0
          ? "No revenue in the current comparison period."
          : !input.hasPreviousPeriod || input.previousRevenue <= 0
            ? "No previous-period revenue baseline; neutral activity score applied."
            : `Revenue changed ${percent((input.revenue - input.previousRevenue) / input.previousRevenue)} versus the previous period.`,
    },
    cash_flow: {
      factor: cashFlow,
      value: operatingCashRatio,
      explanation: `${percent(operatingCashRatio)} operating cash flow relative to revenue; financing and transfers excluded where classified.`,
    },
    liquidity: {
      factor: liquidity,
      value: liquidityRatio,
      explanation:
        liquidityRatio === null
          ? "No payables are due within 60 days."
          : `${liquidityRatio.toFixed(2)}× coverage from cash and receivables against payables due within 60 days.`,
    },
    inventory_health: {
      factor: inventoryFactor,
      value: inventory ? inventoryFactor : null,
      explanation: inventory
        ? `In-stock ${percent(inventory.inStockRate)}; risk reductions include negative stock, dead stock${profileKey === "pharmacy" && inventory.hasExpiryData ? ", and near-expiry stock" : ""}.`
        : "Inventory metrics are not available.",
    },
  };
  const components = (Object.keys(profile.weights) as HealthComponentKey[])
    .filter((key) => profile.applies[key])
    .map((key) => {
      const maxPoints = profile.weights[key];
      return {
        key,
        label: HEALTH_COMPONENT_LABELS[key],
        points: Math.round(raw[key].factor * maxPoints * 10) / 10,
        maxPoints,
        value: raw[key].value,
        explanation: raw[key].explanation,
      };
    });
  const score = Math.round(components.reduce((sum, component) => sum + component.points, 0));
  const label =
    score >= BUSINESS_HEALTH_CONFIG.labels.healthy
      ? "Healthy"
      : score >= BUSINESS_HEALTH_CONFIG.labels.watch
        ? "Watch"
        : "At risk";
  if (profileKey === "sme_default" && !input.businessType) {
    notes.push("Using the SME default profile because no business type is set.");
  }
  return { score, label, components, state: "ready", notes };
}

export type HealthInventoryItem = {
  productId: string;
  variantId: string | null;
  stock: number;
  inventoryValue: number | null;
  createdAt?: string | null;
  lastMovementDate?: string | null;
  expiryRiskValue?: number;
  hasExpiryData?: boolean;
};

/** Sales-value weighting and stock-risk inputs for the inventory component. */
export function inventoryHealthMetrics(
  items: HealthInventoryItem[],
  soldValues: Map<string, number>,
  asOf = new Date(),
  nearExpiryDays = BUSINESS_HEALTH_CONFIG.periods.pharmacyNearExpiryDays,
): InventoryHealthInput {
  const productKey = (productId: string, variantId: string | null) =>
    `${productId}:${variantId ?? ""}`;
  let soldValue = 0;
  let inStockValue = 0;
  let negativeValue = 0;
  for (const [key, value] of soldValues) {
    const item = items.find(
      (candidate) => productKey(candidate.productId, candidate.variantId) === key,
    );
    if (!item) continue;
    soldValue += value;
    if (item.stock > 0) inStockValue += value;
    if (item.stock < 0) negativeValue += value;
  }
  const inventoryValue = items.reduce(
    (sum, item) => (item.inventoryValue === null ? sum : sum + Math.max(item.inventoryValue, 0)),
    0,
  );
  const deadValue = items.reduce((sum, item) => {
    if (item.inventoryValue === null) return sum;
    const lastActivity = item.lastMovementDate ?? item.createdAt;
    if (!lastActivity) return sum + Math.max(item.inventoryValue, 0);
    const daysSinceMovement = (asOf.getTime() - new Date(lastActivity).getTime()) / 86_400_000;
    return daysSinceMovement > BUSINESS_HEALTH_CONFIG.periods.deadStockDays
      ? sum + Math.max(item.inventoryValue, 0)
      : sum;
  }, 0);
  const expiryValue = items.reduce((sum, item) => sum + (item.expiryRiskValue ?? 0), 0);
  const hasExpiryData = items.some((item) => item.hasExpiryData);
  return {
    inStockRate: soldValue > 0 ? inStockValue / soldValue : 1,
    negativeStockShare: soldValue > 0 ? negativeValue / soldValue : 0,
    deadStockShare: inventoryValue > 0 ? deadValue / inventoryValue : 0,
    expiryRiskShare: inventoryValue > 0 ? expiryValue / inventoryValue : 0,
    hasExpiryData,
  };
}

export function healthScoreFromRecords(input: {
  businessType?: string | null;
  sales: Row[];
  expenses: Row[];
  cashTransactions: Row[];
  receivables: Row[];
  payables: Row[];
  products: Row[];
  variants: Row[];
  saleItems: Row[];
  inventoryMovements: Row[];
  batches: Row[];
  asOf?: Date;
  periodSales?: Row[];
  cashFlowSales?: Row[];
  range?: {
    fromDate: string;
    toDate: string;
    previousFromDate?: string | null;
    previousToDate?: string | null;
    hasPreviousPeriod: boolean;
    timezone?: string;
  };
  salesHistoryExists?: boolean;
}): BusinessHealthResult {
  const asOf = input.asOf ?? new Date();
  const timezone = input.range?.timezone ?? "Asia/Manila";
  const asOfDay = dateInTimeZone(asOf, timezone);
  const daysAgo = (days: number) => addCalendarDays(asOfDay, -days);
  const profileKey = resolveHealthProfile(input.businessType);
  const cashWindowDays = BUSINESS_HEALTH_CONFIG.cashFlow.rollingProfiles.includes(profileKey)
    ? BUSINESS_HEALTH_CONFIG.periods.growthDays * 3
    : BUSINESS_HEALTH_CONFIG.periods.growthDays;
  const currentStart = input.range?.fromDate ?? daysAgo(BUSINESS_HEALTH_CONFIG.periods.growthDays);
  const currentEnd = input.range?.toDate ?? asOfDay;
  const previousStart =
    input.range?.previousFromDate ?? daysAgo(BUSINESS_HEALTH_CONFIG.periods.growthDays * 2);
  const previousEnd =
    input.range?.previousToDate ?? addCalendarDays(currentStart, -1);
  const cashStart = daysAgo(cashWindowDays);
  const inventoryStart = daysAgo(BUSINESS_HEALTH_CONFIG.periods.inventorySalesDays);
  const postedSales = input.sales.filter(isPostedSale);
  const periodSales = (input.periodSales ?? postedSales).filter(isPostedSale);
  const currentSales = periodSales.filter(
    (sale) =>
      String(sale.sale_date ?? "") >= currentStart && String(sale.sale_date ?? "") <= currentEnd,
  );
  const previousSales = periodSales.filter(
    (sale) =>
      String(sale.sale_date ?? "") >= previousStart && String(sale.sale_date ?? "") <= previousEnd,
  );
  const currentRevenue = salesMetrics(currentSales).revenue;
  const previousRevenue = salesMetrics(previousSales).revenue;
  const periodExpenses = input.expenses.filter(
    (expense) =>
      String(expense.expense_date ?? "") >= currentStart &&
      String(expense.expense_date ?? "") <= currentEnd,
  );
  const expenseTotal = periodExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount ?? 0),
    0,
  );
  const netProfit = salesMetrics(currentSales).grossProfit - expenseTotal;
  const cashWindowSales = (input.cashFlowSales ?? postedSales)
    .filter(isPostedSale)
    .filter(
    (sale) => String(sale.sale_date ?? "") >= cashStart && String(sale.sale_date ?? "") <= asOfDay,
    );
  const cashWindowRevenue = salesMetrics(cashWindowSales).revenue;
  const excludedCashPatterns = BUSINESS_HEALTH_CONFIG.cashFlow.excludedCashPatterns;
  const operatingCashFlow = input.cashTransactions
    .filter((transaction) => {
      const date = String(transaction.transaction_date ?? transaction.created_at ?? "");
      if (date < cashStart || date > asOfDay) return false;
      const classification =
        `${transaction.category ?? ""} ${transaction.description ?? ""}`.toLowerCase();
      return !excludedCashPatterns.some((pattern) => classification.includes(pattern));
    })
    .reduce((sum, transaction) => {
      const amount = Number(transaction.amount ?? 0);
      if (transaction.type === "in") return sum + amount;
      if (transaction.type === "out") return sum - amount;
      return sum;
    }, 0);
  const cash = input.cashTransactions.reduce((sum, transaction) => {
    const amount = Number(transaction.amount ?? 0);
    if (transaction.type === "in") return sum + amount;
    if (transaction.type === "out") return sum - amount;
    return sum;
  }, 0);
  const receivables = input.receivables.reduce(
    (sum, row) => sum + Math.max(Number(row.amount ?? 0) - Number(row.paid ?? 0), 0),
    0,
  );
  const payablesDue = input.payables.reduce((sum, row) => {
    if (
      !row.due_date ||
      String(row.due_date) > daysAgo(-BUSINESS_HEALTH_CONFIG.periods.payablesDueDays)
    ) {
      return sum;
    }
    return sum + Math.max(Number(row.amount ?? 0) - Number(row.paid ?? 0), 0);
  }, 0);

  const saleById = new Map(input.sales.map((sale) => [String(sale.id), sale]));
  const soldValues = new Map<string, number>();
  const itemKey = (productId: string, variantId: string | null) =>
    `${productId}:${variantId ?? ""}`;
  for (const item of input.saleItems) {
    const sale = saleById.get(String(item.sale_id));
    if (
      !sale ||
      !isPostedSale(sale) ||
      String(sale.sale_date ?? "") < inventoryStart ||
      String(sale.sale_date ?? "") > asOfDay
    ) {
      continue;
    }
    const key = itemKey(String(item.product_id ?? ""), item.variant_id ?? null);
    const value = Math.max(Number(item.total ?? 0) * saleSign(sale), 0);
    soldValues.set(key, (soldValues.get(key) ?? 0) + value);
  }

  const productsWithVariants = new Set(input.variants.map((variant) => String(variant.product_id)));
  const items: HealthInventoryItem[] = input.products
    .filter((product) => !productsWithVariants.has(String(product.id)))
    .map((product) => {
      const unitCost = [product.average_cost, product.cost_price]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value > 0);
      return {
        productId: String(product.id),
        variantId: null,
        stock: Number(product.stock ?? 0),
        inventoryValue: unitCost === undefined ? null : Number(product.stock ?? 0) * unitCost,
        createdAt: product.created_at ?? null,
      };
    });
  for (const variant of input.variants) {
    items.push({
      productId: String(variant.product_id),
      variantId: String(variant.id),
      stock: Number(variant.stock ?? 0),
      inventoryValue:
        Number(variant.cost_price) > 0
          ? Number(variant.stock ?? 0) * Number(variant.cost_price)
          : null,
      createdAt: variant.created_at ?? null,
    });
  }
  const lastMovement = new Map<string, string>();
  for (const movement of input.inventoryMovements) {
    const key = itemKey(String(movement.product_id ?? ""), movement.variant_id ?? null);
    const date = String(movement.movement_date ?? movement.created_at ?? "");
    if (date > (lastMovement.get(key) ?? "")) lastMovement.set(key, date);
  }
  const expiryByItem = new Map<string, { hasData: boolean; riskValue: number }>();
  const expiryCutoff = new Date(asOf);
  expiryCutoff.setUTCDate(
    expiryCutoff.getUTCDate() + BUSINESS_HEALTH_CONFIG.periods.pharmacyNearExpiryDays,
  );
  for (const batch of input.batches) {
    const key = itemKey(String(batch.product_id ?? ""), batch.variant_id ?? null);
    const state = expiryByItem.get(key) ?? { hasData: false, riskValue: 0 };
    if (batch.expiry_date) {
      state.hasData = true;
      if (new Date(String(batch.expiry_date)) <= expiryCutoff) {
        state.riskValue +=
          Math.max(Number(batch.remaining_quantity ?? 0), 0) * Number(batch.unit_cost ?? 0);
      }
    }
    expiryByItem.set(key, state);
  }
  for (const item of items) {
    const key = itemKey(item.productId, item.variantId);
    item.lastMovementDate = lastMovement.get(key) ?? null;
    const expiry = expiryByItem.get(key);
    item.hasExpiryData = expiry?.hasData ?? false;
    item.expiryRiskValue = expiry?.riskValue ?? 0;
  }
  const inventory = inventoryHealthMetrics(items, soldValues, asOf);

  return healthScore({
    businessType: input.businessType,
    netMargin: currentRevenue > 0 ? netProfit / currentRevenue : 0,
    revenue: currentRevenue,
    previousRevenue,
    hasPreviousPeriod: input.range?.hasPreviousPeriod ?? true,
    operatingCashFlow,
    cashFlowRevenue: cashWindowRevenue,
    cash,
    receivables,
    payablesDue,
    hasSalesHistory: input.salesHistoryExists ?? postedSales.length > 0,
    hasExpensesInPeriod: periodExpenses.length > 0,
    inventory,
    ...(input.range?.hasPreviousPeriod === false ? { previousRevenue: 0 } : {}),
  });
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
