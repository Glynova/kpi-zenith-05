import { db, type Row } from "@/lib/db";
import { normalizeUnit, toStockUnit } from "@/lib/units";
import { ALL_KINDS, KIND_INFO, MADE_FROM, patchForKind, type ItemKind } from "@/lib/item-kinds";

export type ImportResult = { ok: number; failed: number; messages: string[]; created: string[] };

const HEADERS: Record<string, string> = {
  sku: "sku",
  barcode: "barcode",
  "product name": "name",
  name: "name",
  description: "description",
  category: "category",
  brand: "brand",
  supplier: "supplier",
  "unit of measure": "unit",
  unit: "unit",
  "cost price": "cost_price",
  "selling price": "selling_price",
  "tax rate": "tax_rate",
  "opening stock": "opening",
  "opening quantity": "opening",
  "reorder level": "reorder_level",
  "reorder qty": "reorder_quantity",
  "reorder quantity": "reorder_quantity",
  warehouse: "warehouse",
  location: "warehouse",
  status: "status",
  "item type": "kind",
  type: "kind",
  "parent sku": "parent_sku",
  "variant options": "options",
  variant: "options",
  components: "components",
  "made from": "components",
};
const NUMERIC = ["cost_price", "selling_price", "tax_rate", "opening", "reorder_level", "reorder_quantity"];
const STATUSES = ["active", "inactive", "discontinued"];

/**
 * Bulk product import. Products are inserted without any opening-stock column;
 * opening stock is posted as an `opening_balance` inventory movement, the same
 * ledger entry the item form writes, so balances and cost layers stay consistent.
 */
export async function importProducts(businessId: string, rows: string[][]): Promise<ImportResult> {
  const header = rows[0].map((h) => HEADERS[h.trim().toLowerCase()] ?? null);
  if (!header.includes("name")) throw new Error('The file needs a "Product Name" column');
  const res: ImportResult = { ok: 0, failed: 0, messages: [], created: [] };

  const [{ data: cats }, { data: sups }, { data: whs }, { data: prods }, { data: vars }] = await Promise.all([
    db.from("categories").select("id,name").eq("business_id", businessId),
    db.from("suppliers").select("id,name").eq("business_id", businessId),
    db
      .from("warehouses")
      .select("id,name,is_default")
      .eq("business_id", businessId)
      .order("is_default", { ascending: false })
      .order("created_at"),
    db.from("products").select("id,sku,unit,cost_price,variant_options").eq("business_id", businessId).not("sku", "is", null),
    db.from("product_variants").select("id,product_id,sku").eq("business_id", businessId).not("sku", "is", null),
  ]);
  const index = (list: Row[] | null) =>
    new Map((list ?? []).map((r) => [String(r.name).trim().toLowerCase(), String(r.id)]));
  const maps: Record<string, Map<string, string>> = {
    categories: index(cats),
    suppliers: index(sups),
    warehouses: index(whs),
  };
  const defaultWh = (whs as Row[] | null)?.[0]?.id ?? null;
  const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const skus = new Set([...(prods ?? []), ...(vars ?? [])].map((p: Row) => lc(p.sku)));
  /** SKU → item (existing + imported in this file), used by variant and component rows. */
  const bySku = new Map<string, { id: string; unit: string; cost: number; warehouse: string | null }>();
  for (const p of (prods ?? []) as Row[])
    bySku.set(lc(p.sku), { id: p.id, unit: normalizeUnit(p.unit), cost: Number(p.cost_price ?? 0), warehouse: null });
  const variantBySku = new Map<string, { id: string; productId: string }>();
  for (const v of (vars ?? []) as Row[]) variantBySku.set(lc(v.sku), { id: v.id, productId: v.product_id });
  const optionsByProduct = new Map<string, Map<string, Set<string>>>();
  const pendingComponents: { n: number; sku: string; productId: string; spec: string }[] = [];

  const ensure = async (table: string, name: string, label: string) => {
    const key = name.trim().toLowerCase();
    const hit = maps[table].get(key);
    if (hit) return hit;
    const { data, error } = await db
      .from(table)
      .insert({ business_id: businessId, name: name.trim() })
      .select("id")
      .single();
    if (error) throw new Error(`could not create ${label} "${name}": ${error.message}`);
    maps[table].set(key, data.id);
    res.created.push(`${label}: ${name.trim()}`);
    return String(data.id);
  };

  const today = new Date().toISOString().slice(0, 10);
  const variantRows: { n: number; rec: Record<string, string>; nums: Record<string, number | null> }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const n = i + 1; // spreadsheet row number (header is row 1)
    const rec: Record<string, string> = {};
    header.forEach((k, c) => {
      if (k) rec[k] = (rows[i][c] ?? "").trim();
    });
    const fail = (why: string) => {
      res.failed++;
      res.messages.push(`Row ${n}${rec.sku ? ` (${rec.sku})` : ""}: ${why}`);
    };
    if (!rec.name) {
      fail("missing product name, skipped");
      continue;
    }
    const nums: Record<string, number | null> = {};
    let bad = "";
    for (const k of NUMERIC) {
      if (!rec[k]) {
        nums[k] = null;
        continue;
      }
      const v = Number(rec[k].replace(/[,%]/g, ""));
      if (!Number.isFinite(v) || v < 0) bad = `${k.replace("_", " ")} must be a number of 0 or more`;
      nums[k] = v;
    }
    if (bad) {
      fail(`${bad}, skipped`);
      continue;
    }
    const skuKey = rec.sku?.toLowerCase();
    if (skuKey && skus.has(skuKey)) {
      fail("duplicate SKU, skipped");
      continue;
    }
    if (rec.parent_sku) {
      variantRows.push({ n, rec, nums });
      continue;
    }
    const kindRaw = lc(rec.kind || "ready");
    const kind = (ALL_KINDS.find(
      (k) => k === kindRaw || lc(KIND_INFO[k].label) === kindRaw || lc(KIND_INFO[k].label).startsWith(kindRaw),
    ) ?? null) as ItemKind | null;
    if (!kind) {
      fail(`unknown item type "${rec.kind}", skipped`);
      continue;
    }
    if (rec.components && !MADE_FROM.includes(kind) && kind !== "service") {
      fail(`components need item type menu, finished or combo, skipped`);
      continue;
    }
    const status = (rec.status || "active").toLowerCase();
    if (!STATUSES.includes(status)) {
      fail(`unknown status "${rec.status}", skipped`);
      continue;
    }
    try {
      const category_id = rec.category ? await ensure("categories", rec.category, "Category") : null;
      const supplier_id = rec.supplier ? await ensure("suppliers", rec.supplier, "Supplier") : null;
      const warehouse_id = rec.warehouse
        ? await ensure("warehouses", rec.warehouse, "Location")
        : defaultWh;
      const cost = nums.cost_price ?? 0;
      const { data: product, error } = await db
        .from("products")
        .insert({
          business_id: businessId,
          name: rec.name,
          sku: rec.sku || `ITM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          barcode: rec.barcode || null,
          description: rec.description || null,
          brand: rec.brand || null,
          category_id,
          supplier_id,
          default_location_id: warehouse_id,
          unit: normalizeUnit(rec.unit),
          cost_price: cost,
          selling_price: nums.selling_price ?? 0,
          tax_rate: nums.tax_rate ?? 0,
          reorder_level: nums.reorder_level ?? 0,
          min_stock: nums.reorder_level ?? 0,
          reorder_quantity: nums.reorder_quantity,
          status,
          ...(kind === "ready"
            ? { item_type: "product", item_subtype: "standard_product", product_type: "standard", inventory_model: "stocked_item", track_stock: true }
            : patchForKind(kind)),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const finalSku = lc(rec.sku) || null;
      if (finalSku) {
        skus.add(finalSku);
        bySku.set(finalSku, { id: product.id, unit: normalizeUnit(rec.unit), cost, warehouse: warehouse_id });
      }
      if (rec.components)
        pendingComponents.push({ n, sku: rec.sku, productId: product.id, spec: rec.components });
      const tracks = (kind === "ready" ? true : patchForKind(kind).track_stock) !== false;
      const qty = tracks ? (nums.opening ?? 0) : 0;
      if (qty > 0) {
        if (!warehouse_id) throw new Error("product saved, but no location exists for opening stock");
        const { error: mErr } = await db.from("inventory_movements").insert({
          business_id: businessId,
          product_id: product.id,
          warehouse_id,
          type: "opening_balance",
          quantity: qty,
          base_quantity: qty,
          unit_cost: cost,
          total_cost: cost * qty,
          reference: "Opening stock",
          reference_type: "opening",
          reason: "Opening stock (import)",
          movement_date: today,
        });
        if (mErr) throw new Error(`product saved, but opening stock failed: ${mErr.message}`);
      }
      res.ok++;
    } catch (e) {
      fail((e as Error).message);
    }
  }
  // Pass 2: variant rows (each is its own stock/cost identity under its parent).
  for (const { n, rec, nums } of variantRows) {
    const fail = (why: string) => {
      res.failed++;
      res.messages.push(`Row ${n}${rec.sku ? ` (${rec.sku})` : ""}: ${why}`);
    };
    const parent = bySku.get(lc(rec.parent_sku));
    if (!parent) {
      fail(`parent SKU "${rec.parent_sku}" not found, skipped`);
      continue;
    }
    const attributes: Record<string, string> = {};
    for (const part of (rec.options || "").split(/[;|]/)) {
      const [k, ...v] = part.split(/[=:]/);
      if (k?.trim() && v.join("").trim()) attributes[k.trim()] = v.join("=").trim();
    }
    if (!Object.keys(attributes).length) {
      fail('variant needs "Variant Options" like "Size=Medium; Color=Red", skipped');
      continue;
    }
    if (!rec.sku) {
      fail("variant needs its own SKU, skipped");
      continue;
    }
    if (skus.has(lc(rec.sku))) {
      fail("duplicate SKU, skipped");
      continue;
    }
    try {
      const warehouse_id = rec.warehouse
        ? await ensure("warehouses", rec.warehouse, "Location")
        : (parent.warehouse ?? defaultWh);
      const cost = nums.cost_price ?? parent.cost;
      const { data: v, error } = await db
        .from("product_variants")
        .insert({
          business_id: businessId,
          product_id: parent.id,
          name: rec.name || Object.values(attributes).join(" / "),
          sku: rec.sku,
          barcode: rec.barcode || null,
          attributes,
          cost_price: cost,
          selling_price: nums.selling_price ?? 0,
          reorder_level: nums.reorder_level ?? 0,
          min_stock: nums.reorder_level ?? 0,
          reorder_quantity: nums.reorder_quantity,
          status: (rec.status || "active").toLowerCase(),
        })
        .select("id")
        .single();
      if (error) throw new Error(/combination/.test(error.message) ? "this option combination already exists" : error.message);
      skus.add(lc(rec.sku));
      variantBySku.set(lc(rec.sku), { id: v.id, productId: parent.id });
      const opts = optionsByProduct.get(parent.id) ?? new Map<string, Set<string>>();
      for (const [k, val] of Object.entries(attributes)) opts.set(k, (opts.get(k) ?? new Set()).add(val));
      optionsByProduct.set(parent.id, opts);
      const qty = nums.opening ?? 0;
      if (qty > 0) {
        if (!warehouse_id) throw new Error("variant saved, but no location exists for opening stock");
        const { error: mErr } = await db.from("inventory_movements").insert({
          business_id: businessId,
          product_id: parent.id,
          variant_id: v.id,
          warehouse_id,
          type: "opening_balance",
          quantity: qty,
          base_quantity: qty,
          unit_cost: cost,
          total_cost: cost * qty,
          reference: "Opening stock",
          reference_type: "opening",
          reason: "Opening stock (import)",
          movement_date: today,
        });
        if (mErr) throw new Error(`variant saved, but opening stock failed: ${mErr.message}`);
      }
      res.ok++;
    } catch (e) {
      fail((e as Error).message);
    }
  }
  for (const [productId, opts] of optionsByProduct) {
    const existing = ((prods ?? []) as Row[]).find((p) => p.id === productId)?.variant_options;
    const merged = new Map<string, Set<string>>();
    for (const o of (Array.isArray(existing) ? existing : []) as { name: string; values: string[] }[])
      merged.set(o.name, new Set(o.values));
    for (const [k, vals] of opts) merged.set(k, new Set([...(merged.get(k) ?? []), ...vals]));
    await db
      .from("products")
      .update({
        has_variants: true,
        variant_options: [...merged].slice(0, 3).map(([name, values]) => ({ name, values: [...values] })),
      })
      .eq("id", productId);
  }

  // Pass 3: "made from" components, e.g. "BEEF:100:g; BUN:1; KETCHUP:0.05".
  for (const { n, sku, productId, spec } of pendingComponents) {
    const lines: Row[] = [];
    let why = "";
    for (const part of spec.split(";").map((x) => x.trim()).filter(Boolean)) {
      const [cSku, qtyRaw, unitRaw] = part.split(":").map((x) => x.trim());
      const qty = Number(qtyRaw);
      const variant = variantBySku.get(lc(cSku));
      const comp = variant ? [...bySku.values()].find((p) => p.id === variant.productId) : bySku.get(lc(cSku));
      if (!comp) why ||= `component "${cSku}" not found`;
      else if (comp.id === productId) why ||= "an item can't be made from itself";
      else if (!Number.isFinite(qty) || qty <= 0) why ||= `component "${cSku}" needs a quantity above 0`;
      else {
        const entered = normalizeUnit(unitRaw || comp.unit);
        const stockQty = toStockUnit(qty, entered, comp.unit);
        if (stockQty == null) why ||= `"${unitRaw}" can't convert to ${comp.unit} for "${cSku}"`;
        else
          lines.push({
            business_id: businessId,
            bundle_product_id: productId,
            component_product_id: comp.id,
            variant_id: variant?.id ?? null,
            quantity: stockQty,
            entered_quantity: qty,
            entered_unit: entered,
            unit_cost: comp.cost,
          });
      }
    }
    if (why) {
      res.messages.push(`Row ${n} (${sku || "no SKU"}): item saved, but components skipped: ${why}`);
      continue;
    }
    const { error } = await db.from("bundle_components").insert(lines);
    if (error) res.messages.push(`Row ${n} (${sku || "no SKU"}): item saved, but components failed: ${error.message}`);
  }
  return res;
}
