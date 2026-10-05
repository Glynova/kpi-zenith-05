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

/** Units the owner may type a component in, given the component's stock unit. */
export function unitsFor(stockUnit: string | null | undefined): string[] {
  const fam = familyOf(String(stockUnit ?? ""));
  return fam ? Object.keys(fam[1]) : [normalizeUnit(stockUnit)];
}

/** Converts a quantity into the stock unit; returns null when the units cannot convert. */
export function toStockUnit(qty: number, from: string, stockUnit: string): number | null {
  const f = normalizeUnit(from);
  const s = normalizeUnit(stockUnit);
  if (f === s) return qty;
  const fam = familyOf(s);
  if (!fam || !(f in fam[1])) return null;
  return Math.round(((qty * fam[1][f]) / fam[1][s]) * 10000) / 10000;
}
