/**
 * Central capability / configuration engine.
 *
 * Every module asks this module (through `useBusiness()`) whether a capability
 * is usable. A capability is usable only when the owner switched it on AND all
 * of its hard prerequisites are switched on too. Disabling a capability stops
 * *new* usage only — historical records stay readable everywhere.
 */
import { FEATURE_GROUPS, type BusinessSettings, type FeatureKey } from "@/lib/business-config";

export type CapabilityKey = FeatureKey;

/** Hard prerequisites. A capability cannot operate without all of these. */
export const CAPABILITY_DEPENDENCIES: Partial<Record<CapabilityKey, CapabilityKey[]>> = {
  enable_stock_transfers: ["track_locations", "track_quantity"],
  enable_stock_counts: ["track_quantity"],
  enable_low_stock_alerts: ["track_quantity"],
  track_batch: ["track_quantity"],
  track_lot: ["track_quantity", "track_batch"],
  track_expiry: ["track_quantity"],
  track_serial: ["track_quantity"],
  enable_production: ["enable_bom", "track_quantity"],
  enable_food_costing: ["enable_bom", "track_cost"],
  enable_waste: ["track_quantity"],
  enable_unit_conversion: ["track_quantity"],
  enable_pos: ["enable_sales"],
  enable_quotes: ["enable_sales"],
  enable_sales_orders: ["enable_sales"],
  enable_shipping: ["enable_sales"],
  enable_customer_credit: ["enable_sales"],
  enable_cash_register: ["enable_pos"],
};

const LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i.label]),
);

export const capabilityLabel = (key: string) => LABELS[key] ?? key;

/** Capabilities that break if `key` is switched off. */
export function dependentsOf(key: CapabilityKey): CapabilityKey[] {
  return (Object.keys(CAPABILITY_DEPENDENCIES) as CapabilityKey[]).filter((k) =>
    (CAPABILITY_DEPENDENCIES[k] ?? []).includes(key),
  );
}

/** Which pages/modules consume a capability (shown as "Used by" in Settings). */
export const CAPABILITY_USED_BY: Partial<Record<CapabilityKey, string[]>> = {
  track_quantity: ["Products", "Stock Movements", "Inventory value", "Reports"],
  track_cost: ["Products", "Inventory value", "Reports", "Food costing"],
  track_locations: ["Locations", "Transfers", "Stock counts"],
  enable_stock_transfers: ["Transfers"],
  enable_stock_counts: ["Stock counts"],
  enable_low_stock_alerts: ["Alerts", "Dashboard"],
  track_batch: ["Batches", "Receiving", "Products"],
  track_lot: ["Batches"],
  track_expiry: ["Batches", "Alerts", "Products"],
  track_serial: ["Serial numbers", "Receiving"],
  track_variants: ["Products", "POS", "Receiving"],
  enable_bom: ["Products (recipes)", "Production", "Food costing"],
  enable_production: ["Production", "Products (recipes)"],
  enable_food_costing: ["Reports", "Products (recipes)"],
  enable_waste: ["Stock Movements"],
  enable_unit_conversion: ["Units", "Purchasing", "Receiving"],
  enable_purchasing: ["Purchase orders", "Suppliers", "Receiving", "Payables"],
  enable_sales: ["Sales", "Invoices", "Customers", "Receivables"],
  enable_services: ["Products (services)"],
  enable_returns: ["Sales returns", "Purchase returns"],
  enable_barcode: ["Products", "POS"],
  enable_projects: ["Stock allocation"],
  enable_pos: ["Point of sale"],
  enable_quotes: ["Sales"],
  enable_sales_orders: ["Sales"],
  enable_shipping: ["Sales"],
  enable_customer_credit: ["Customers", "Receivables"],
  enable_cash_register: ["Point of sale"],
};

export type CapabilityStatus = {
  key: CapabilityKey;
  label: string;
  /** Raw stored toggle. */
  enabled: boolean;
  /** Prerequisites that are switched off. */
  missing: CapabilityKey[];
  /** Enabled, and every prerequisite satisfied. */
  usable: boolean;
};

type FlagSource = Partial<Record<CapabilityKey, boolean>>;

export function capabilityStatus(flags: FlagSource, key: CapabilityKey): CapabilityStatus {
  const enabled = !!flags[key];
  const missing = (CAPABILITY_DEPENDENCIES[key] ?? []).filter((d) => !flags[d]);
  return { key, label: capabilityLabel(key), enabled, missing, usable: enabled && !missing.length };
}

/** The single predicate every module should use. */
export function isCapabilityEnabled(flags: FlagSource, key: CapabilityKey): boolean {
  return capabilityStatus(flags, key).usable;
}

/** Every capability that is on but broken by a missing prerequisite. */
export function configurationHealth(flags: FlagSource): CapabilityStatus[] {
  return (Object.keys(CAPABILITY_DEPENDENCIES) as CapabilityKey[])
    .map((k) => capabilityStatus(flags, k))
    .filter((s) => s.enabled && s.missing.length > 0);
}

/**
 * Turning a capability on pulls in its prerequisites (recursively) so the
 * owner never lands in a broken state by accident.
 */
export function withPrerequisites(flags: FlagSource, key: CapabilityKey): FlagSource {
  const next: FlagSource = { ...flags, [key]: true };
  for (const dep of CAPABILITY_DEPENDENCIES[key] ?? []) {
    if (!next[dep]) Object.assign(next, withPrerequisites(next, dep));
  }
  return next;
}

/** Preview of what a preset would change, without applying it. */
export function presetDiff(
  current: FlagSource,
  preset: Record<string, unknown>,
): { key: CapabilityKey; label: string; from: boolean; to: boolean }[] {
  return (Object.keys(preset) as CapabilityKey[])
    .filter((k) => typeof preset[k] === "boolean")
    .map((k) => ({ key: k, label: capabilityLabel(k), from: !!current[k], to: !!preset[k] }))
    .filter((d) => d.from !== d.to);
}

/** Route -> capability required to open it (direct URL access included). */
export const ROUTE_CAPABILITY: Record<string, CapabilityKey> = {
  "/pos": "enable_pos",
  "/purchase-orders": "enable_purchasing",
  "/suppliers": "enable_purchasing",
  "/payables": "enable_purchasing",
  "/sales": "enable_sales",
  "/invoices": "enable_sales",
  "/customers": "enable_sales",
  "/receivables": "enable_sales",
  "/transfers": "enable_stock_transfers",
  "/stock-counts": "enable_stock_counts",
  "/batches": "track_batch",
  "/serials": "track_serial",
  "/variants": "track_variants",
  "/units": "enable_unit_conversion",
  "/locations": "track_locations",
  "/inventory": "track_quantity",
};

export function routeCapability(pathname: string): CapabilityKey | undefined {
  if (ROUTE_CAPABILITY[pathname]) return ROUTE_CAPABILITY[pathname];
  const base = Object.keys(ROUTE_CAPABILITY).find((r) => pathname.startsWith(`${r}/`));
  return base ? ROUTE_CAPABILITY[base] : undefined;
}

/** Business rules (numeric/enum settings) read through one accessor. */
export type RuleKey =
  | "low_stock_rule"
  | "expiry_alert_days"
  | "po_approval_threshold"
  | "discount_limit_percent"
  | "costing_method"
  | "enable_alerts";

export function getRule<K extends RuleKey>(
  settings: BusinessSettings,
  key: K,
): BusinessSettings[K] {
  return settings[key];
}
