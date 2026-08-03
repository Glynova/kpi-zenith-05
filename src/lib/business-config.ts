/**
 * Configuration-first inventory platform.
 *
 * BUSINESS  ->  BUSINESS CONFIGURATION  ->  PRODUCT CONFIGURATION
 *           ->  UNIVERSAL INVENTORY ENGINE
 *
 * There is only one inventory engine (products / locations / balances /
 * transactions). Business type only supplies *recommended* defaults; owners can
 * turn any capability on or off afterwards.
 */

export type FeatureKey =
  | "track_quantity"
  | "track_cost"
  | "track_locations"
  | "track_batch"
  | "track_expiry"
  | "track_serial"
  | "track_lot"
  | "track_variants"
  | "enable_bom"
  | "enable_production"
  | "enable_waste"
  | "enable_unit_conversion"
  | "enable_returns"
  | "enable_purchasing"
  | "enable_sales"
  | "enable_barcode"
  | "enable_projects"
  | "enable_assets"
  | "enable_services"
  | "enable_low_stock_alerts"
  | "enable_stock_counts"
  | "enable_stock_transfers"
  | "enable_food_costing";

/** Optional product fields the owner can switch on or off. */
export type ProductCapability =
  | "sku"
  | "barcode"
  | "selling_price"
  | "cost_price"
  | "reorder_level"
  | "brand"
  | "warranty";

export const PRODUCT_CAPABILITIES: {
  key: ProductCapability;
  label: string;
  hint: string;
  recommended: boolean;
}[] = [
  { key: "sku", label: "SKU", hint: "Your own item code.", recommended: true },
  { key: "barcode", label: "Barcode", hint: "Scannable code on the item.", recommended: true },
  { key: "selling_price", label: "Selling price", hint: "What customers pay.", recommended: true },
  { key: "cost_price", label: "Purchase cost", hint: "What you pay suppliers.", recommended: true },
  { key: "reorder_level", label: "Reorder level", hint: "When to restock.", recommended: true },
  { key: "brand", label: "Brand", hint: "Manufacturer or brand name.", recommended: false },
  { key: "warranty", label: "Warranty", hint: "Warranty period per item.", recommended: false },
];

export const DEFAULT_PRODUCT_CAPABILITIES: Record<ProductCapability, boolean> = Object.fromEntries(
  PRODUCT_CAPABILITIES.map((c) => [c.key, c.recommended]),
) as Record<ProductCapability, boolean>;

export type BusinessSettings = Record<FeatureKey, boolean> & {
  id?: string;
  business_id?: string;
  costing_method: CostingMethod;
  low_stock_rule: string;
  expiry_alert_days: number;
  extra?: Record<string, unknown>;
};


export type CostingMethod = "weighted_average" | "fifo" | "standard";

export const COSTING_METHODS: { value: CostingMethod; label: string; description: string }[] = [
  {
    value: "weighted_average",
    label: "Weighted average",
    description: "Cost recalculates on every receipt. Best default for most businesses.",
  },
  {
    value: "fifo",
    label: "FIFO",
    description: "First batch in is the first costed out. Needs batch tracking.",
  },
  {
    value: "standard",
    label: "Standard cost",
    description: "You set the cost manually; variances show in reports.",
  },
];

export const FEATURE_GROUPS: {
  label: string;
  items: { key: FeatureKey; label: string; hint: string }[];
}[] = [
  {
    label: "Inventory tracking",
    items: [
      { key: "track_quantity", label: "Quantity", hint: "Track stock levels per product." },
      { key: "track_cost", label: "Cost", hint: "Track purchase cost and inventory value." },
      { key: "track_locations", label: "Locations", hint: "Branches, warehouses, kitchens." },
      { key: "track_batch", label: "Batch", hint: "Batch numbers on receipts and issues." },
      { key: "track_lot", label: "Lot number", hint: "Lot references alongside batches." },
      { key: "track_expiry", label: "Expiry", hint: "Expiry dates and expiring-soon alerts." },
      { key: "track_serial", label: "Serial number", hint: "One record per physical unit." },
      { key: "track_variants", label: "Variants", hint: "Size / colour / style per product." },
    ],
  },
  {
    label: "Capabilities",
    items: [
      { key: "enable_bom", label: "Recipes / BOM", hint: "Build products from components." },
      { key: "enable_production", label: "Production", hint: "Production orders and WIP." },
      { key: "enable_waste", label: "Waste", hint: "Record waste and spoilage separately." },
      { key: "enable_unit_conversion", label: "Unit conversion", hint: "1 case = 24 pcs, 1 kg = 1000 g." },
      { key: "enable_purchasing", label: "Purchasing", hint: "Suppliers and purchase orders." },
      { key: "enable_sales", label: "Sales", hint: "Sales, invoices and receivables." },
      { key: "enable_returns", label: "Returns", hint: "Customer and supplier returns." },
      { key: "enable_barcode", label: "Barcode", hint: "Barcodes on products and variants." },
      { key: "enable_projects", label: "Projects / jobs", hint: "Allocate stock to jobs or sites." },
      { key: "enable_assets", label: "Assets / equipment", hint: "Track equipment as inventory." },
    ],
  },
];

const ALL_FEATURES = FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.key));

function preset(enabled: FeatureKey[], costing: CostingMethod = "weighted_average") {
  const out = {} as Record<FeatureKey, boolean>;
  ALL_FEATURES.forEach((k) => (out[k] = enabled.includes(k)));
  return { ...out, costing_method: costing };
}

const BASE: FeatureKey[] = [
  "track_quantity",
  "track_cost",
  "enable_purchasing",
  "enable_sales",
  "enable_returns",
  "enable_barcode",
];

export type BusinessType = {
  value: string;
  label: string;
  summary: string;
  defaults: Record<FeatureKey, boolean> & { costing_method: CostingMethod };
};

export const BUSINESS_TYPES: BusinessType[] = [
  {
    value: "retail",
    label: "Retail / Store",
    summary: "SKUs, barcodes, variants, reorder levels.",
    defaults: preset([...BASE, "track_variants"]),
  },
  {
    value: "restaurant",
    label: "Restaurant / Food & Beverage",
    summary: "Ingredients, recipes, food costing, waste, unit conversion.",
    defaults: preset([
      ...BASE,
      "enable_bom",
      "enable_production",
      "enable_waste",
      "enable_unit_conversion",
      "track_expiry",
      "track_batch",
      "track_locations",
    ]),
  },
  {
    value: "grocery",
    label: "Grocery / Supermarket",
    summary: "Batches, expiry, barcodes, high SKU count.",
    defaults: preset([...BASE, "track_batch", "track_expiry", "enable_unit_conversion", "enable_waste"]),
  },
  {
    value: "wholesale",
    label: "Wholesale / Distribution",
    summary: "Cases, boxes, pieces, conversions, multiple warehouses.",
    defaults: preset([...BASE, "enable_unit_conversion", "track_locations"]),
  },
  {
    value: "manufacturing",
    label: "Manufacturing",
    summary: "Raw materials, BOM, production, WIP, finished goods.",
    defaults: preset([
      ...BASE,
      "enable_bom",
      "enable_production",
      "enable_waste",
      "track_locations",
      "track_batch",
      "enable_unit_conversion",
    ]),
  },
  {
    value: "construction",
    label: "Construction",
    summary: "Consumables, equipment, transfers, job allocation.",
    defaults: preset([...BASE, "track_locations", "enable_projects", "enable_assets", "track_serial"]),
  },
  {
    value: "ecommerce",
    label: "E-commerce",
    summary: "SKU, barcode, variants, warehouse stock, returns.",
    defaults: preset([...BASE, "track_variants", "track_locations"]),
  },
  {
    value: "clothing",
    label: "Clothing / Fashion",
    summary: "Size and colour variants with SKU and barcode each.",
    defaults: preset([...BASE, "track_variants"]),
  },
  {
    value: "electronics",
    label: "Electronics",
    summary: "Serial numbers, warranty, batches, variants.",
    defaults: preset([...BASE, "track_serial", "track_batch", "track_variants"]),
  },
  {
    value: "automotive",
    label: "Automotive / Parts",
    summary: "Parts catalogue, serials, multiple locations.",
    defaults: preset([...BASE, "track_serial", "track_locations"]),
  },
  {
    value: "pharmacy",
    label: "Pharmacy / Healthcare",
    summary: "Batch, lot, expiry and recall control.",
    defaults: preset([...BASE, "track_batch", "track_lot", "track_expiry", "enable_unit_conversion"]),
  },
  {
    value: "agriculture",
    label: "Agriculture",
    summary: "Harvest batches, weight units, locations, production.",
    defaults: preset([
      ...BASE,
      "track_batch",
      "track_expiry",
      "enable_unit_conversion",
      "track_locations",
      "enable_production",
    ]),
  },
  {
    value: "services",
    label: "Service Business",
    summary: "Inventory optional — services and non-stocked items.",
    defaults: preset(["track_cost", "enable_sales", "enable_returns"]),
  },
  {
    value: "distribution",
    label: "Distribution",
    summary: "Multi-warehouse distribution with conversions.",
    defaults: preset([...BASE, "track_locations", "enable_unit_conversion"]),
  },
  {
    value: "other",
    label: "Other",
    summary: "Start simple: quantity, cost, purchasing and sales.",
    defaults: preset(BASE),
  },
];

export const DEFAULT_SETTINGS: BusinessSettings = {
  ...preset(BASE),
  low_stock_rule: "reorder_level",
  expiry_alert_days: 30,
} as BusinessSettings;

export function defaultsForType(type: string) {
  return (BUSINESS_TYPES.find((t) => t.value === type) ?? BUSINESS_TYPES.at(-1)!).defaults;
}

export const PRODUCT_TYPES = ["stocked", "non_stocked", "consumable", "service", "asset"];

export const INVENTORY_MODELS = [
  "stocked_item",
  "non_stocked_item",
  "consumable",
  "service",
  "raw_material",
  "semi_finished",
  "finished_product",
  "asset",
];

export const LOCATION_TYPES = [
  "warehouse",
  "store",
  "branch",
  "kitchen",
  "storage",
  "production",
  "site",
  "vehicle",
];

/** Every movement supported by the universal engine. */
export const MOVEMENT_TYPES = [
  "purchase",
  "sale",
  "transfer_out",
  "transfer_in",
  "adjustment_in",
  "adjustment_out",
  "production",
  "consumption",
  "return_in",
  "return_out",
  "damage",
  "waste",
  "stock_count",
  "opening_balance",
  "stock_in",
  "stock_out",
];

const IN_TYPES = new Set([
  "stock_in",
  "purchase",
  "return_in",
  "adjustment_in",
  "transfer_in",
  "production",
  "opening_balance",
]);
const OUT_TYPES = new Set([
  "stock_out",
  "sale",
  "return_out",
  "adjustment_out",
  "transfer_out",
  "consumption",
  "damage",
  "waste",
]);

export function movementSign(type: string): number {
  if (IN_TYPES.has(type)) return 1;
  if (OUT_TYPES.has(type)) return -1;
  return 0;
}

export const UNIT_CATEGORIES = ["count", "weight", "volume", "length", "time"];
