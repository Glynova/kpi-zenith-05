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
  | "enable_food_costing"
  | "enable_pos"
  | "enable_quotes"
  | "enable_sales_orders"
  | "enable_shipping"
  | "enable_customer_credit"
  | "enable_cash_register";

/** Optional product fields the owner can switch on or off. */
export type ProductCapability =
  "sku" | "barcode" | "selling_price" | "cost_price" | "reorder_level" | "brand" | "warranty";

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
  /** Sales & POS configuration. */
  tax_name: string;
  tax_rate: number;
  tax_inclusive: boolean;
  sales_inventory_timing: "sale_completed" | "payment_completed" | "fulfillment";
  sales_bom_mode: "finished_good" | "consume_components";
  discount_limit_percent: number;
  po_approval_threshold: number;
  enable_alerts: boolean;
  payment_methods: string[];
  sales_channels: string[];
  allow_negative_stock?: boolean;
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
      {
        key: "enable_stock_transfers",
        label: "Stock transfers",
        hint: "Move stock between locations.",
      },
      {
        key: "enable_stock_counts",
        label: "Stock counts",
        hint: "Physical counts that set actual stock.",
      },
      {
        key: "enable_low_stock_alerts",
        label: "Low stock alerts",
        hint: "Warn when stock runs low.",
      },
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
      {
        key: "enable_food_costing",
        label: "Food costing",
        hint: "Cost per recipe and per serving.",
      },
      { key: "enable_waste", label: "Waste", hint: "Record waste and spoilage separately." },
      {
        key: "enable_unit_conversion",
        label: "Unit conversion",
        hint: "1 case = 24 pcs, 1 kg = 1000 g.",
      },
      { key: "enable_purchasing", label: "Purchasing", hint: "Suppliers and purchase orders." },
      { key: "enable_sales", label: "Sales", hint: "Sales, invoices and receivables." },
      { key: "enable_services", label: "Services", hint: "Sell services that hold no stock." },
      { key: "enable_returns", label: "Returns", hint: "Customer and supplier returns." },
      { key: "enable_barcode", label: "Barcode", hint: "Barcodes on products and variants." },
      {
        key: "enable_projects",
        label: "Projects / jobs",
        hint: "Allocate stock to jobs or sites.",
      },
    ],
  },
  {
    label: "Selling",
    items: [
      {
        key: "enable_pos",
        label: "Point of sale",
        hint: "Fast counter selling with a cart and receipts.",
      },
      {
        key: "enable_quotes",
        label: "Quotations",
        hint: "Send quotes and convert them to orders.",
      },
      {
        key: "enable_sales_orders",
        label: "Sales orders",
        hint: "Confirm orders before fulfilling them.",
      },
      {
        key: "enable_shipping",
        label: "Shipping & delivery",
        hint: "Delivery addresses, methods and tracking.",
      },
      {
        key: "enable_customer_credit",
        label: "Customer credit",
        hint: "Credit limits and outstanding balances.",
      },
      {
        key: "enable_cash_register",
        label: "Cash registers",
        hint: "Open and close tills with cash variance.",
      },
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
  "enable_low_stock_alerts",
  "enable_stock_counts",
  "enable_pos",
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
      "enable_food_costing",
      "track_expiry",
      "track_batch",
      "track_locations",
      "enable_stock_transfers",
    ]),
  },
  {
    value: "grocery",
    label: "Grocery / Supermarket",
    summary: "Batches, expiry, barcodes, high SKU count.",
    defaults: preset([
      ...BASE,
      "track_batch",
      "track_expiry",
      "enable_unit_conversion",
      "enable_waste",
    ]),
  },
  {
    value: "wholesale",
    label: "Wholesale / Distribution",
    summary: "Cases, boxes, pieces, conversions, multiple warehouses.",
    defaults: preset([
      ...BASE,
      "enable_unit_conversion",
      "track_locations",
      "enable_stock_transfers",
    ]),
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
      "enable_stock_transfers",
      "track_batch",
      "enable_unit_conversion",
    ]),
  },
  {
    value: "construction",
    label: "Construction",
    summary: "Consumables, equipment, transfers, job allocation.",
    defaults: preset([
      ...BASE,
      "track_locations",
      "enable_stock_transfers",
      "enable_projects",
      "enable_assets",
      "track_serial",
    ]),
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
    defaults: preset([
      ...BASE,
      "track_batch",
      "track_lot",
      "track_expiry",
      "enable_unit_conversion",
    ]),
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
    defaults: preset(["track_cost", "enable_sales", "enable_returns", "enable_services"]),
  },
  {
    value: "distribution",
    label: "Distribution",
    summary: "Multi-warehouse distribution with conversions.",
    defaults: preset([
      ...BASE,
      "track_locations",
      "enable_stock_transfers",
      "enable_unit_conversion",
    ]),
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
  tax_name: "Tax",
  tax_rate: 0,
  tax_inclusive: false,
  sales_inventory_timing: "sale_completed",
  sales_bom_mode: "finished_good",
  discount_limit_percent: 0,
  po_approval_threshold: 0,
  enable_alerts: true,
  payment_methods: ["cash", "card", "bank_transfer", "digital_wallet", "credit", "other"],
  sales_channels: ["pos", "online", "phone", "manual", "wholesale", "other"],
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

/** Countries with their default currency and timezone (wizard step 1). */
export const COUNTRIES: { code: string; name: string; currency: string; timezone: string }[] = [
  { code: "PH", name: "Philippines", currency: "PHP", timezone: "Asia/Manila" },
  { code: "US", name: "United States", currency: "USD", timezone: "America/New_York" },
  { code: "CA", name: "Canada", currency: "CAD", timezone: "America/Toronto" },
  { code: "GB", name: "United Kingdom", currency: "GBP", timezone: "Europe/London" },
  { code: "AU", name: "Australia", currency: "AUD", timezone: "Australia/Sydney" },
  { code: "NZ", name: "New Zealand", currency: "NZD", timezone: "Pacific/Auckland" },
  { code: "SG", name: "Singapore", currency: "SGD", timezone: "Asia/Singapore" },
  { code: "MY", name: "Malaysia", currency: "MYR", timezone: "Asia/Kuala_Lumpur" },
  { code: "ID", name: "Indonesia", currency: "IDR", timezone: "Asia/Jakarta" },
  { code: "TH", name: "Thailand", currency: "THB", timezone: "Asia/Bangkok" },
  { code: "VN", name: "Vietnam", currency: "VND", timezone: "Asia/Ho_Chi_Minh" },
  { code: "IN", name: "India", currency: "INR", timezone: "Asia/Kolkata" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", timezone: "Asia/Dubai" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", timezone: "Asia/Riyadh" },
  { code: "ZA", name: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg" },
  { code: "NG", name: "Nigeria", currency: "NGN", timezone: "Africa/Lagos" },
  { code: "KE", name: "Kenya", currency: "KES", timezone: "Africa/Nairobi" },
  { code: "DE", name: "Germany", currency: "EUR", timezone: "Europe/Berlin" },
  { code: "FR", name: "France", currency: "EUR", timezone: "Europe/Paris" },
  { code: "ES", name: "Spain", currency: "EUR", timezone: "Europe/Madrid" },
  { code: "IT", name: "Italy", currency: "EUR", timezone: "Europe/Rome" },
  { code: "NL", name: "Netherlands", currency: "EUR", timezone: "Europe/Amsterdam" },
  { code: "JP", name: "Japan", currency: "JPY", timezone: "Asia/Tokyo" },
  { code: "MX", name: "Mexico", currency: "MXN", timezone: "America/Mexico_City" },
  { code: "BR", name: "Brazil", currency: "BRL", timezone: "America/Sao_Paulo" },
];

export const CURRENCIES = Array.from(new Set(COUNTRIES.map((c) => c.currency))).sort();

/**
 * "What do you need to track?" cards (wizard step 2). Each selection turns on
 * one or more capability flags — nothing here is business-type specific.
 */
export const TRACK_ITEMS: {
  key: string;
  label: string;
  hint: string;
  features: FeatureKey[];
}[] = [
  {
    key: "products",
    label: "Products",
    hint: "Physical items you buy, hold and sell.",
    features: ["track_quantity", "track_cost"],
  },
  {
    key: "services",
    label: "Services",
    hint: "Work you sell that holds no stock.",
    features: ["enable_services", "enable_sales"],
  },
  {
    key: "raw_materials",
    label: "Raw materials",
    hint: "Inputs consumed to make other items.",
    features: ["track_quantity", "enable_purchasing"],
  },
  {
    key: "finished_products",
    label: "Finished products",
    hint: "Items produced in-house and ready to sell.",
    features: ["enable_production"],
  },
  {
    key: "consumables",
    label: "Consumables",
    hint: "Supplies used up in daily operations.",
    features: ["track_quantity"],
  },
  {
    key: "equipment",
    label: "Equipment / assets",
    hint: "Tools and machines you keep track of.",
    features: ["enable_assets"],
  },
  {
    key: "packaging",
    label: "Packaging",
    hint: "Boxes, bags and containers you stock.",
    features: ["track_quantity"],
  },
  {
    key: "ingredients",
    label: "Ingredients",
    hint: "Food or chemical inputs measured by weight or volume.",
    features: ["enable_unit_conversion", "enable_food_costing"],
  },
  {
    key: "variants",
    label: "Product variants",
    hint: "Sizes, colours, models or specs under one product.",
    features: ["track_variants"],
  },
  {
    key: "batches",
    label: "Batches / lots",
    hint: "Group stock by production or delivery batch.",
    features: ["track_batch", "track_lot"],
  },
  {
    key: "expiry",
    label: "Expiration dates",
    hint: "Know what expires and when.",
    features: ["track_expiry"],
  },
  {
    key: "serials",
    label: "Serial numbers",
    hint: "One record per physical unit.",
    features: ["track_serial"],
  },
  {
    key: "bom",
    label: "Recipes & components",
    hint: "Build items from other items and cost them automatically.",
    features: ["enable_bom"],
  },
  {
    key: "production",
    label: "Production",
    hint: "Production runs that consume inputs and create output.",
    features: ["enable_production", "enable_bom"],
  },
  {
    key: "locations",
    label: "Multiple locations",
    hint: "Stores, warehouses, kitchens or sites.",
    features: ["track_locations", "enable_stock_transfers"],
  },
];

/** Location types offered in the wizard. */
export const WIZARD_LOCATION_TYPES = [
  { value: "store", label: "Store" },
  { value: "warehouse", label: "Warehouse" },
  { value: "branch", label: "Branch" },
  { value: "kitchen", label: "Kitchen" },
  { value: "production", label: "Factory" },
  { value: "site", label: "Office" },
  { value: "storage", label: "Other" },
];

/** Plain-language names shown in the wizard for costing methods. */
export const COSTING_PLAIN: Record<CostingMethod, { label: string; hint: string }> = {
  weighted_average: {
    label: "Automatic average cost",
    hint: "Automatically calculates average inventory cost as purchases arrive.",
  },
  fifo: {
    label: "Oldest stock first (FIFO)",
    hint: "Uses the cost of the oldest inventory first.",
  },
  standard: { label: "Fixed standard cost", hint: "Uses a predefined standard cost for products." },
};

/** Starter units suggested for every business, plus their conversions. */
export const STARTER_UNITS: { code: string; name: string; category: string; is_base: boolean }[] = [
  { code: "pcs", name: "Piece", category: "count", is_base: true },
  { code: "g", name: "Gram", category: "weight", is_base: true },
  { code: "kg", name: "Kilogram", category: "weight", is_base: false },
  { code: "ml", name: "Milliliter", category: "volume", is_base: true },
  { code: "l", name: "Liter", category: "volume", is_base: false },
  { code: "box", name: "Box", category: "count", is_base: false },
  { code: "pack", name: "Pack", category: "count", is_base: false },
  { code: "case", name: "Case", category: "count", is_base: false },
  { code: "bottle", name: "Bottle", category: "count", is_base: false },
  { code: "bag", name: "Bag", category: "count", is_base: false },
  { code: "dozen", name: "Dozen", category: "count", is_base: false },
];

export const STARTER_CONVERSIONS: { from_unit: string; to_unit: string; factor: number }[] = [
  { from_unit: "kg", to_unit: "g", factor: 1000 },
  { from_unit: "l", to_unit: "ml", factor: 1000 },
  { from_unit: "case", to_unit: "pcs", factor: 24 },
  { from_unit: "dozen", to_unit: "pcs", factor: 12 },
];

/** Grouped catalog of standard units of measure used across the app. */
export const UNIT_OPTION_GROUPS: { label: string; options: { value: string; label: string }[] }[] =
  [
    {
      label: "Count",
      options: [
        { value: "pcs", label: "pcs — Piece" },
        { value: "unit", label: "unit — Unit" },
        { value: "box", label: "box — Box" },
        { value: "pack", label: "pack — Pack" },
        { value: "case", label: "case — Case" },
        { value: "set", label: "set — Set" },
        { value: "pair", label: "pair — Pair" },
        { value: "dozen", label: "dozen — Dozen" },
        { value: "carton", label: "carton — Carton" },
        { value: "bottle", label: "bottle — Bottle" },
        { value: "can", label: "can — Can" },
        { value: "jar", label: "jar — Jar" },
        { value: "bag", label: "bag — Bag" },
        { value: "sack", label: "sack — Sack" },
        { value: "tube", label: "tube — Tube" },
        { value: "roll", label: "roll — Roll" },
        { value: "sheet", label: "sheet — Sheet" },
        { value: "ream", label: "ream — Ream" },
        { value: "bundle", label: "bundle — Bundle" },
        { value: "pallet", label: "pallet — Pallet" },
      ],
    },
    {
      label: "Weight",
      options: [
        { value: "kg", label: "kg — Kilogram" },
        { value: "g", label: "g — Gram" },
        { value: "mg", label: "mg — Milligram" },
        { value: "lb", label: "lb — Pound" },
        { value: "oz", label: "oz — Ounce" },
        { value: "tonne", label: "tonne — Tonne" },
      ],
    },
    {
      label: "Volume",
      options: [
        { value: "l", label: "L — Liter" },
        { value: "ml", label: "ml — Milliliter" },
        { value: "gal", label: "gal — Gallon" },
      ],
    },
    {
      label: "Length",
      options: [
        { value: "m", label: "m — Meter" },
        { value: "cm", label: "cm — Centimeter" },
        { value: "mm", label: "mm — Millimeter" },
        { value: "in", label: "in — Inch" },
        { value: "ft", label: "ft — Foot" },
        { value: "yd", label: "yd — Yard" },
      ],
    },
    {
      label: "Area & Volume (space)",
      options: [
        { value: "sqm", label: "sqm — Square meter" },
        { value: "cbm", label: "cbm — Cubic meter" },
      ],
    },
    {
      label: "Time",
      options: [
        { value: "hour", label: "hour — Hour" },
        { value: "day", label: "day — Day" },
      ],
    },
    {
      label: "Service",
      options: [
        { value: "service", label: "service — Service" },
        { value: "session", label: "session — Session" },
        { value: "license", label: "license — License" },
      ],
    },
  ];
