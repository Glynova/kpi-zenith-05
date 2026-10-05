import { db, type Row } from "@/lib/db";

export type AddonRule = "pick1_required" | "pick1_optional" | "pick_any";
export const RULE_LABEL: Record<AddonRule, string> = {
  pick1_required: "Pick 1, required",
  pick1_optional: "Pick 1, optional",
  pick_any: "Pick any, optional",
};
export type AddonIngredient = {
  key: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unit: string;
};
export type AddonOption = {
  id?: string;
  key: string;
  name: string;
  extra_price: number;
  kitchen_note?: string | null;
  archived?: boolean;
  ingredients: AddonIngredient[];
};
export type AddonGroup = {
  id: string;
  name: string;
  rule: AddonRule;
  options: AddonOption[];
  usage: number;
};

/** Loads every shared add-on group with its options, ingredients and how many items use it. */
export async function fetchAddonGroups(businessId: string): Promise<AddonGroup[]> {
  const [groups, options, comps, links] = await Promise.all([
    db
      .from("addon_groups")
      .select("*")
      .eq("business_id", businessId)
      .eq("archived", false)
      .order("created_at"),
    db.from("addon_options").select("*").eq("business_id", businessId).order("sort"),
    db.from("addon_option_components").select("*").eq("business_id", businessId),
    db.from("product_addon_groups").select("group_id,product_id").eq("business_id", businessId),
  ]);
  const compRows = (comps.data ?? []) as Row[];
  const linkRows = (links.data ?? []) as Row[];
  return ((groups.data ?? []) as Row[]).map((g) => ({
    id: g.id,
    name: g.name,
    rule: g.rule as AddonRule,
    usage: linkRows.filter((l) => l.group_id === g.id).length,
    options: ((options.data ?? []) as Row[])
      .filter((o) => o.group_id === g.id && !o.archived)
      .map((o) => ({
        id: o.id,
        key: o.id,
        name: o.name,
        extra_price: Number(o.extra_price ?? 0),
        kitchen_note: o.kitchen_note,
        ingredients: compRows
          .filter((c) => c.option_id === o.id)
          .map((c) => ({
            key: c.id,
            productId: c.component_product_id,
            variantId: c.variant_id ?? null,
            quantity: Number(c.entered_quantity ?? c.quantity),
            unit: String(c.entered_unit ?? ""),
          })),
      })),
  }));
}

/** Product id → attached group ids, in display order. */
export async function fetchAddonLinks(businessId: string): Promise<Record<string, string[]>> {
  const { data } = await db
    .from("product_addon_groups")
    .select("product_id,group_id,sort")
    .eq("business_id", businessId)
    .order("sort");
  const map: Record<string, string[]> = {};
  for (const r of (data ?? []) as Row[]) (map[r.product_id] ??= []).push(r.group_id);
  return map;
}

export type ChosenAddon = {
  option_id: string;
  group_name: string;
  option_name: string;
  extra_price: number;
  extra_cost: number;
};
