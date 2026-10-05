/** Item type cards: presets only change which cards show first; every card stays reachable. */
export type ItemKind = "ready" | "ingredient" | "menu" | "finished" | "combo" | "service" | "package";

export const KIND_INFO: Record<ItemKind, { label: string; hint: string }> = {
  ready: { label: "Ready-to-sell item", hint: "Bought and sold as is" },
  ingredient: { label: "Ingredient or supply", hint: "Used to make other items, not sold" },
  menu: { label: "Menu item", hint: "Made when ordered from ingredients" },
  finished: { label: "Finished product", hint: "Made ahead in batches" },
  combo: { label: "Combo", hint: "Several items sold together" },
  service: { label: "Service", hint: "Time and skill, no stock" },
  package: { label: "Package", hint: "A set of sessions" },
};

const PRESETS: Record<string, ItemKind[]> = {
  restaurant: ["menu", "ingredient", "ready", "combo"],
  manufacturing: ["finished", "ingredient", "ready"],
  services: ["service", "ingredient", "package"],
  retail: ["ready", "combo"],
};

export function kindsForBusiness(type: string | null | undefined): ItemKind[] {
  return PRESETS[String(type ?? "")] ?? PRESETS.retail;
}
export const ALL_KINDS = Object.keys(KIND_INFO) as ItemKind[];

/** Items whose cost comes from what they are made from. */
export const MADE_FROM: ItemKind[] = ["menu", "finished", "combo"];

export function kindOf(form: Record<string, unknown>): ItemKind {
  const type = String(form.item_type || "product");
  const sub = String(form.item_subtype || "");
  if (type === "service") return sub === "package" ? "package" : "service";
  if (type === "bundle") return "combo";
  if (sub === "menu_item") return "menu";
  if (sub === "finished_product") return "finished";
  if (sub === "raw_material" || sub === "consumable") return "ingredient";
  return "ready";
}

export function patchForKind(kind: ItemKind, industryLabel?: string): Record<string, unknown> {
  void industryLabel;
  switch (kind) {
    case "ingredient":
      return { item_type: "product", item_subtype: "raw_material", track_stock: true, is_sellable: false, is_purchasable: true, consumption_mode: "on_sale" };
    case "menu":
      return { item_type: "product", item_subtype: "menu_item", track_stock: false, has_variants: false, is_sellable: true, is_purchasable: false, consumption_mode: "on_sale" };
    case "finished":
      return { item_type: "product", item_subtype: "finished_product", track_stock: true, has_variants: false, is_sellable: true, is_purchasable: false, consumption_mode: "on_production" };
    case "combo":
      return { item_type: "bundle", item_subtype: "fixed_bundle", track_stock: false, has_variants: false, is_sellable: true, consumption_mode: "on_sale" };
    case "service":
      return { item_type: "service", item_subtype: "standard_service", track_stock: false, has_variants: false, is_sellable: true, consumption_mode: "on_sale" };
    case "package":
      return { item_type: "service", item_subtype: "package", track_stock: false, has_variants: false, is_sellable: true, consumption_mode: "on_sale" };
    default:
      return { item_type: "product", item_subtype: "standard_product", track_stock: true, is_sellable: true, is_purchasable: true, consumption_mode: "on_sale" };
  }
}
