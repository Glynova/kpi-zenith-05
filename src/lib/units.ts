/** Shared recipe-unit conversion: only units from the same family as the stock unit are offered. */
const FAMILIES: Record<string, Record<string, number>> = {
  weight: { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 },
  volume: { ml: 1, L: 1000, tsp: 5, tbsp: 15, cup: 240 },
};
const ALIASES: Record<string, string> = {
  gram: "g",
  grams: "g",
  gm: "g",
  gr: "g",
  kilogram: "kg",
  kilograms: "kg",
  kilo: "kg",
  kgs: "kg",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  ounce: "oz",
  ounces: "oz",
  milliliter: "ml",
  millilitre: "ml",
  mls: "ml",
  l: "L",
  liter: "L",
  litre: "L",
  liters: "L",
  litres: "L",
  ltr: "L",
  teaspoon: "tsp",
  tablespoon: "tbsp",
  cups: "cup",
};

export type UnitConversionRule = {
  product_id: string | null;
  variant_id?: string | null;
  from_unit: string;
  to_unit: string;
  factor: number;
};

export function normalizeUnit(unit: string | null | undefined): string {
  const raw = String(unit ?? "").trim();
  if (!raw) return "pcs";
  if (raw === "L") return "L";
  const lower = raw.toLowerCase();
  return ALIASES[lower] ?? lower;
}

function familyOf(unit: string) {
  const u = normalizeUnit(unit);
  return Object.entries(FAMILIES).find(([, units]) => u in units);
}

function matchingRules(
  rules: UnitConversionRule[],
  productId?: string | null,
  variantId?: string | null,
) {
  return rules
    .filter((rule) => {
      if (rule.product_id == null) return true;
      if (rule.product_id !== productId) return false;
      return rule.variant_id == null || rule.variant_id === variantId;
    })
    .sort((a, b) => {
      const priority = (rule: UnitConversionRule) =>
        rule.product_id == null ? 2 : rule.variant_id == null ? 1 : 0;
      return priority(a) - priority(b);
    });
}

/** Units the owner may type a component in, given the component's stock unit. */
export function unitsFor(
  stockUnit: string | null | undefined,
  rules: UnitConversionRule[] = [],
  productId?: string | null,
  variantId?: string | null,
): string[] {
  const fam = familyOf(String(stockUnit ?? ""));
  const stock = normalizeUnit(stockUnit);
  const units = new Set(fam ? Object.keys(fam[1]) : [stock]);
  for (const rule of matchingRules(rules, productId, variantId)) {
    const from = normalizeUnit(rule.from_unit);
    const to = normalizeUnit(rule.to_unit);
    if (to === stock && Number(rule.factor) > 0) units.add(from);
    if (from === stock && Number(rule.factor) > 0) units.add(to);
  }
  return [...units];
}

/** Converts a quantity into the stock unit; returns null when the units cannot convert. */
export function toStockUnit(
  qty: number,
  from: string,
  stockUnit: string,
  rules: UnitConversionRule[] = [],
  productId?: string | null,
  variantId?: string | null,
): number | null {
  const f = normalizeUnit(from);
  const s = normalizeUnit(stockUnit);
  if (f === s) return qty;
  for (const rule of matchingRules(rules, productId, variantId)) {
    const ruleFrom = normalizeUnit(rule.from_unit);
    const ruleTo = normalizeUnit(rule.to_unit);
    const factor = Number(rule.factor);
    if (!Number.isFinite(factor) || factor <= 0) continue;
    if (ruleFrom === f && ruleTo === s) return Math.round(qty * factor * 10000) / 10000;
    if (ruleFrom === s && ruleTo === f) return Math.round((qty / factor) * 10000) / 10000;
  }
  const fam = familyOf(s);
  if (!fam || !(f in fam[1])) return null;
  return Math.round(((qty * fam[1][f]) / fam[1][s]) * 10000) / 10000;
}
