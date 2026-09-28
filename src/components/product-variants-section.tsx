/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Variant editor embedded in the product form.
 *
 * Edit Product is the single source of truth for a product and all of its
 * variants. Rows are written to `product_variants`; opening quantities post an
 * `opening_balance` movement against the exact variant so the stock ledger,
 * POs, receiving, alerts and POS all resolve the same variant_id.
 */
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wand2, X } from "lucide-react";

import { db, type Row } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type VariantOption = { key: string; name: string; values: string };

export type VariantExtra = {
  weight: number | null;
  wholesale_price: number | null;
  supplier_item_code: string;
  min_stock: number | null;
  max_stock: number | null;
  reorder_quantity: number | null;
  bin_location: string;
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export type VariantDraft = {
  key: string;
  id: string | null;
  attributes: Record<string, string>;
  name: string;
  sku: string;
  barcode: string;
  cost_price: number;
  selling_price: number;
  opening_qty: number;
  reorder_level: number;
  stock: number;
  status: string;
  extra: VariantExtra;
};

export const MAX_OPTIONS = 3;
const rid = () => Math.random().toString(36).slice(2);
const newOption = (): VariantOption => ({ key: rid(), name: "", values: "" });
const blankOptions = () => Array.from({ length: MAX_OPTIONS }, newOption);

export function splitValues(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

/** Cartesian product of the attribute dimensions, e.g. Size × Type. */
export function combinations(options: VariantOption[]): Record<string, string>[] {
  const dims = options
    .map((o) => ({ name: o.name.trim(), values: splitValues(o.values) }))
    .filter((o) => o.name && o.values.length);
  if (!dims.length) return [];
  return dims.reduce<Record<string, string>[]>(
    (acc, dim) => acc.flatMap((combo) => dim.values.map((v) => ({ ...combo, [dim.name]: v }))),
    [{}],
  );
}

export const comboKey = (attrs: Record<string, string>) =>
  Object.keys(attrs)
    .sort()
    .map((k) => `${k.toLowerCase()}=${String(attrs[k]).toLowerCase()}`)
    .join("|");

export const comboLabel = (attrs: Record<string, string>) =>
  Object.keys(attrs)
    .map((k) => attrs[k])
    .join(" / ");

export type VariantDefaults = {
  cost: number;
  price: number;
  sku: string;
  name: string;
  reorderLevel: number;
};

function skuFor(base: string, attrs: Record<string, string>) {
  const prefix = (base || "").trim().toUpperCase();
  if (!prefix) return "";
  return `${prefix}-${Object.values(attrs)
    .map((v) =>
      String(v)
        .replace(/\s+/g, "")
        .slice(0, 3)
        .toUpperCase(),
    )
    .join("-")}`;
}

export function useProductVariants(businessId: string | null) {
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<VariantOption[]>(blankOptions);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (row: Row | null) => {
    setOptions(blankOptions());
    setVariants([]);
    setRemoved([]);
    if (!row?.id) return;
    setLoading(true);
    try {
      const { data } = await db
        .from("product_variants")
        .select(
          "id,name,sku,barcode,attributes,cost_price,selling_price,stock,status,weight,wholesale_price,supplier_item_code,min_stock,max_stock,reorder_level,reorder_quantity,bin_location",
        )
        .eq("product_id", row.id)
        .order("created_at");
      const list: VariantDraft[] = ((data ?? []) as Row[]).map((v) => ({
        key: v.id,
        id: v.id as string,
        attributes: (v.attributes ?? {}) as Record<string, string>,
        name: String(v.name ?? ""),
        sku: String(v.sku ?? ""),
        barcode: String(v.barcode ?? ""),
        cost_price: Number(v.cost_price ?? 0),
        selling_price: Number(v.selling_price ?? 0),
        opening_qty: 0,
        reorder_level: Number(v.reorder_level ?? 0),
        stock: Number(v.stock ?? 0),
        status: String(v.status ?? "active"),
        extra: {
          weight: num(v.weight),
          wholesale_price: num(v.wholesale_price),
          supplier_item_code: String(v.supplier_item_code ?? ""),
          min_stock: num(v.min_stock),
          max_stock: num(v.max_stock),
          reorder_quantity: num(v.reorder_quantity),
          bin_location: String(v.bin_location ?? ""),
        },
      }));
      setVariants(list);

      const stored = Array.isArray(row.variant_options) ? (row.variant_options as any[]) : [];
      let opts: VariantOption[] = stored.map((o: any) => ({
        key: rid(),
        name: String(o?.name ?? ""),
        values: Array.isArray(o?.values) ? o.values.join(", ") : String(o?.values ?? ""),
      }));
      if (!opts.length && list.length) {
        const dims = new Map<string, Set<string>>();
        for (const v of list)
          for (const [k, val] of Object.entries(v.attributes)) {
            if (!dims.has(k)) dims.set(k, new Set());
            dims.get(k)!.add(String(val));
          }
        opts = Array.from(dims.entries()).map(([name, values]) => ({
          key: rid(),
          name,
          values: Array.from(values).join(", "),
        }));
      }
      opts = opts.slice(0, MAX_OPTIONS);
      while (opts.length < MAX_OPTIONS) opts.push(newOption());
      setOptions(opts);
    } finally {
      setLoading(false);
    }
  }, []);

  const active = variants.filter((v) => v.status !== "archived");

  /** `takenSkus` = lowercased SKUs used elsewhere in the business. */
  function validate(takenSkus: Set<string>): string | null {
    if (!active.length) return "Add at least one variant (fill in options and Generate variants)";
    const names = new Set<string>();
    const skus = new Set<string>();
    for (const v of active) {
      const label = v.name.trim();
      if (!label) return "Every variant needs a name";
      if (names.has(label.toLowerCase())) return `Duplicate variant "${label}"`;
      names.add(label.toLowerCase());
      const sku = v.sku.trim().toLowerCase();
      if (sku) {
        if (skus.has(sku) || takenSkus.has(sku))
          return `SKU "${v.sku.trim()}" is already used in this business`;
        skus.add(sku);
      }
      if (Number(v.selling_price) < 0 || Number(v.cost_price) < 0)
        return `${label}: price and cost cannot be negative`;
      if (Number(v.opening_qty) < 0) return `${label}: opening quantity cannot be negative`;
    }
    return null;
  }

  /** Writes variants + opening stock. Returns draft key → saved variant id. */
  async function persist(productId: string, warehouseId: string | null) {
    const ids: Record<string, string> = {};
    const payload = (v: VariantDraft) => ({
      business_id: businessId,
      product_id: productId,
      name: v.name.trim(),
      sku: v.sku.trim() || null,
      barcode: v.barcode.trim() || null,
      attributes: v.attributes ?? {},
      cost_price: Number(v.cost_price ?? 0),
      selling_price: Number(v.selling_price ?? 0),
      status: v.status || "active",
      reorder_level: Number(v.reorder_level ?? 0),
      weight: num(v.extra.weight),
      wholesale_price: num(v.extra.wholesale_price),
      supplier_item_code: v.extra.supplier_item_code.trim() || null,
      min_stock: num(v.extra.min_stock),
      max_stock: num(v.extra.max_stock),
      reorder_quantity: num(v.extra.reorder_quantity),
      bin_location: v.extra.bin_location.trim() || null,
    });

    // Removed rows first so their SKUs are free for replacement rows.
    for (const id of removed) {
      const { error } = await db.from("product_variants").delete().eq("id", id);
      if (error) {
        const { error: archiveError } = await db
          .from("product_variants")
          .update({ status: "archived" })
          .eq("id", id);
        if (archiveError) throw archiveError;
      }
    }

    for (const v of variants) {
      let id = v.id;
      if (id) {
        const { error } = await db.from("product_variants").update(payload(v)).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from("product_variants")
          .insert(payload(v))
          .select("id")
          .single();
        if (error) throw error;
        id = data.id as string;
      }
      ids[v.key] = id;
      const qty = Number(v.opening_qty ?? 0);
      if (!v.id && qty > 0) {
        const cost = Number(v.cost_price ?? 0);
        const { error } = await db.from("inventory_movements").insert({
          business_id: businessId,
          product_id: productId,
          variant_id: id,
          warehouse_id: warehouseId,
          type: "opening_balance",
          quantity: qty,
          base_quantity: qty,
          unit_cost: cost,
          total_cost: cost * qty,
          reference: "Opening stock",
          reference_type: "opening",
          reason: "Opening stock",
          movement_date: new Date().toISOString().slice(0, 10),
        });
        if (error) throw error;
      }
    }

    const { error: optionsError } = await db
      .from("products")
      .update({
        variant_options: options
          .filter((o) => o.name.trim() && splitValues(o.values).length)
          .map((o) => ({ name: o.name.trim(), values: splitValues(o.values) })),
      })
      .eq("id", productId);
    if (optionsError) throw optionsError;

    setRemoved([]);
    setVariants((prev) =>
      prev.map((v) => ({ ...v, id: ids[v.key] ?? v.id, opening_qty: 0 })),
    );
    queryClient.invalidateQueries({ queryKey: ["product-variant-summary", businessId] });
    queryClient.invalidateQueries({ queryKey: ["resource", "products", businessId] });
    queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
    return ids;
  }

  function update(key: string, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  /** Rebuild the rows from the options, keeping typed values for surviving combinations. */
  function generate(d: VariantDefaults) {
    const combos = combinations(options);
    const byCombo = new Map(variants.map((v) => [comboKey(v.attributes), v]));
    const next: VariantDraft[] = combos.map((attributes) => {
      const existing = byCombo.get(comboKey(attributes));
      if (existing) return { ...existing, attributes, status: "active" };
      return {
        key: rid(),
        id: null,
        attributes,
        name: comboLabel(attributes),
        sku: skuFor(d.sku || d.name.slice(0, 3), attributes),
        barcode: "",
        cost_price: d.cost,
        selling_price: d.price,
        opening_qty: 0,
        reorder_level: d.reorderLevel,
        stock: 0,
        status: "active",
        extra: {
          weight: null,
          wholesale_price: null,
          supplier_item_code: "",
          min_stock: null,
          max_stock: null,
          reorder_quantity: null,
          bin_location: "",
        },
      };
    });
    const keep = new Set(next.map((v) => v.key));
    const dropped = variants.filter((v) => !keep.has(v.key) && v.id).map((v) => v.id!);
    if (dropped.length) setRemoved((r) => [...r, ...dropped]);
    setVariants(next);
  }

  function removeRow(v: VariantDraft) {
    if (v.id) setRemoved((r) => [...r, v.id!]);
    setVariants((prev) => prev.filter((x) => x.key !== v.key));
  }

  const setVariantCost = (key: string, cost: number) => update(key, { cost_price: cost });

  /** Options card (plain render function so inputs keep focus). */
  function renderOptions(d: VariantDefaults) {
    const count = combinations(options).length;
    return (
      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Options</h3>
          <span className="text-xs text-muted-foreground">Separate values with commas</span>
        </div>
        <div className="space-y-2 p-4">
          {options.map((o, i) => (
            <div key={o.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-2">
              <Input
                aria-label={`Option ${i + 1} name`}
                value={o.name}
                placeholder={i === 0 ? "Size" : i === 1 ? "Type" : "Option 3 (optional)"}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((x) => (x.key === o.key ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label={`Option ${i + 1} values`}
                value={o.values}
                placeholder={i === 0 ? "Regular, Large" : i === 1 ? "Beef, Chicken" : "Values"}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((x) => (x.key === o.key ? { ...x, values: e.target.value } : x)),
                  )
                }
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => generate(d)}>
              <Wand2 className="size-4" /> Generate variants
            </Button>
            <span className="text-xs text-muted-foreground">
              {count} variant{count === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderTable() {
    const cell = "h-9 text-sm";
    return (
      <div className="rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Variants</h3>
          <span className="text-xs text-muted-foreground">Stock is tracked per row</span>
        </div>
        <div className="space-y-2 p-4">
          {loading && <p className="text-xs text-muted-foreground">Loading variants…</p>}
          {variants.length === 0 && !loading ? (
            <p className="text-xs text-muted-foreground">
              Fill in the options above and press Generate variants.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium">Variant</th>
                    <th className="pb-2 pr-2 font-medium">SKU</th>
                    <th className="pb-2 pr-2 font-medium">Cost</th>
                    <th className="pb-2 pr-2 font-medium">Price</th>
                    <th className="pb-2 pr-2 font-medium">Opening qty</th>
                    <th className="pb-2 pr-2 font-medium">Reorder</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.key}>
                      <td className="py-1 pr-2">
                        <Input
                          className={cell}
                          aria-label="Variant name"
                          value={v.name}
                          onChange={(e) => update(v.key, { name: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <Input
                          className={cell}
                          aria-label="Variant SKU"
                          value={v.sku}
                          onChange={(e) => update(v.key, { sku: e.target.value })}
                        />
                      </td>
                      <td className="w-24 py-1 pr-2">
                        <Input
                          className={cell}
                          type="number"
                          step="any"
                          aria-label="Variant cost"
                          value={v.cost_price}
                          onChange={(e) => update(v.key, { cost_price: Number(e.target.value) })}
                        />
                      </td>
                      <td className="w-24 py-1 pr-2">
                        <Input
                          className={cell}
                          type="number"
                          step="any"
                          aria-label="Variant price"
                          value={v.selling_price}
                          onChange={(e) =>
                            update(v.key, { selling_price: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="w-24 py-1 pr-2">
                        {v.id ? (
                          <span
                            className="block px-2 text-sm tabular-nums text-muted-foreground"
                            title="Existing variant — adjust stock from Inventory"
                          >
                            {v.stock} on hand
                          </span>
                        ) : (
                          <Input
                            className={cell}
                            type="number"
                            step="any"
                            min="0"
                            aria-label="Opening quantity"
                            value={v.opening_qty}
                            onChange={(e) =>
                              update(v.key, { opening_qty: Number(e.target.value) })
                            }
                          />
                        )}
                      </td>
                      <td className="w-20 py-1 pr-2">
                        <Input
                          className={cell}
                          type="number"
                          step="any"
                          aria-label="Reorder level"
                          value={v.reorder_level}
                          onChange={(e) =>
                            update(v.key, { reorder_level: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="py-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={`Remove ${v.name}`}
                          title="Removed variants with history are archived automatically"
                          onClick={() => removeRow(v)}
                        >
                          <X className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
            Each row becomes its own item in the stock ledger, purchase orders, and POS. Remove a
            row to skip that combination.
          </p>
        </div>
      </div>
    );
  }

  return {
    load,
    validate,
    persist,
    renderOptions,
    renderTable,
    setVariantCost,
    variants: active,
    options,
  };
}
