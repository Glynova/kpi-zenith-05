import { db, type Row } from "@/lib/db";
import { normalizeUnit } from "@/lib/units";

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

  const [{ data: cats }, { data: sups }, { data: whs }, { data: prods }] = await Promise.all([
    db.from("categories").select("id,name").eq("business_id", businessId),
    db.from("suppliers").select("id,name").eq("business_id", businessId),
    db
      .from("warehouses")
      .select("id,name,is_default")
      .eq("business_id", businessId)
      .order("is_default", { ascending: false })
      .order("created_at"),
    db.from("products").select("sku").eq("business_id", businessId).not("sku", "is", null),
  ]);
  const index = (list: Row[] | null) =>
    new Map((list ?? []).map((r) => [String(r.name).trim().toLowerCase(), String(r.id)]));
  const maps: Record<string, Map<string, string>> = {
    categories: index(cats),
    suppliers: index(sups),
    warehouses: index(whs),
  };
  const defaultWh = (whs as Row[] | null)?.[0]?.id ?? null;
  const skus = new Set((prods ?? []).map((p: Row) => String(p.sku).trim().toLowerCase()));

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
          item_type: "product",
          item_subtype: "standard_product",
          product_type: "standard",
          inventory_model: "stocked_item",
          track_stock: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (skuKey) skus.add(skuKey);
      const qty = nums.opening ?? 0;
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
  return res;
}
