/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Variant editor embedded in the product form.
 *
 * Edit Product is the single source of truth for a product and all of its
 * variants. This hook reads and writes the same `product_variants` rows every
 * other module (purchasing, receiving, inventory, POS) resolves against, and
 * stores the attribute dimensions on `products.variant_options`.
 */
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wand2, ArchiveRestore, Archive } from "lucide-react";

import { db, type Row } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type VariantOption = { key: string; name: string; values: string };

export type VariantExtra = {
  weight: number | null;
  wholesale_price: number | null;
  supplier_item_code: string;
  min_stock: number | null;
  max_stock: number | null;
  reorder_level: number | null;
  reorder_quantity: number | null;
  bin_location: string;
};

const EXTRA_KEYS: { key: keyof VariantExtra; label: string; numeric: boolean }[] = [
  { key: "wholesale_price", label: "Wholesale", numeric: true },
  { key: "weight", label: "Weight", numeric: true },
  { key: "supplier_item_code", label: "Supplier code", numeric: false },
  { key: "bin_location", label: "Shelf / bin", numeric: false },
  { key: "min_stock", label: "Min stock", numeric: true },
  { key: "max_stock", label: "Max stock", numeric: true },
  { key: "reorder_level", label: "Reorder point", numeric: true },
  { key: "reorder_quantity", label: "Reorder qty", numeric: true },
];

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
  stock: number;
  status: string;
  extra: VariantExtra;
  /** Set once the user edits price/cost so parent defaults never overwrite it. */
  overridden: boolean;
};

const rid = () => Math.random().toString(36).slice(2);

function newOption(): VariantOption {
  return { key: rid(), name: "", values: "" };
}

function splitValues(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

/** Cartesian product of the attribute dimensions, e.g. Color × Size. */
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

export function useProductVariants(businessId: string | null) {
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<VariantOption[]>([newOption()]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (row: Row | null) => {
    setOptions([newOption()]);
    setVariants([]);
    setRemoved([]);
    if (!row?.id) return;
    setLoading(true);
    try {
      const stored = Array.isArray(row.variant_options) ? (row.variant_options as any[]) : [];
      if (stored.length) {
        setOptions(
          stored.map((o: any) => ({
            key: rid(),
            name: String(o?.name ?? ""),
            values: Array.isArray(o?.values) ? o.values.join(", ") : String(o?.values ?? ""),
          })),
        );
      }
      const { data } = await db
        .from("product_variants")
        .select(
          "id,name,sku,barcode,attributes,cost_price,selling_price,stock,status,weight,wholesale_price,supplier_item_code,min_stock,max_stock,reorder_level,reorder_quantity,bin_location",
        )
        .eq("product_id", row.id)
        .order("created_at");
      const list = ((data ?? []) as Row[]).map((v) => ({
        key: v.id,
        id: v.id as string,
        attributes: (v.attributes ?? {}) as Record<string, string>,
        name: String(v.name ?? ""),
        sku: String(v.sku ?? ""),
        barcode: String(v.barcode ?? ""),
        cost_price: Number(v.cost_price ?? 0),
        selling_price: Number(v.selling_price ?? 0),
        stock: Number(v.stock ?? 0),
        status: String(v.status ?? "active"),
        extra: {
          weight: num(v.weight),
          wholesale_price: num(v.wholesale_price),
          supplier_item_code: String(v.supplier_item_code ?? ""),
          min_stock: num(v.min_stock),
          max_stock: num(v.max_stock),
          reorder_level: num(v.reorder_level),
          reorder_quantity: num(v.reorder_quantity),
          bin_location: String(v.bin_location ?? ""),
        },
        overridden: true,
      }));
      setVariants(list);
      if (!stored.length && list.length) {
        // Rebuild the dimensions from the saved combinations.
        const dims = new Map<string, Set<string>>();
        for (const v of list) {
          for (const [k, val] of Object.entries(v.attributes)) {
            if (!dims.has(k)) dims.set(k, new Set());
            dims.get(k)!.add(String(val));
          }
        }
        if (dims.size) {
          setOptions(
            Array.from(dims.entries()).map(([name, values]) => ({
              key: rid(),
              name,
              values: Array.from(values).join(", "),
            })),
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function validate(): string | null {
    const active = variants.filter((v) => v.status !== "archived");
    if (!active.length)
      return "Add at least one variant, or switch this product back to a simple product";
    const names = new Set<string>();
    const skus = new Set<string>();
    const barcodes = new Set<string>();
    for (const v of active) {
      const label = v.name.trim();
      if (!label) return "Every variant needs a name";
      if (names.has(label.toLowerCase())) return `Duplicate variant "${label}"`;
      names.add(label.toLowerCase());
      const key = comboKey(v.attributes);
      if (key && names.has(`combo:${key}`)) return `Duplicate combination "${label}"`;
      names.add(`combo:${key}`);
      const sku = v.sku.trim().toLowerCase();
      if (sku) {
        if (skus.has(sku)) return `Duplicate SKU "${v.sku.trim()}"`;
        skus.add(sku);
      }
      const bc = v.barcode.trim().toLowerCase();
      if (bc) {
        if (barcodes.has(bc)) return `Duplicate barcode "${v.barcode.trim()}"`;
        barcodes.add(bc);
      }
      if (Number(v.selling_price) < 0 || Number(v.cost_price) < 0)
        return `${label}: price and cost cannot be negative`;
    }
    return null;
  }

  /** Writes variants + the dimension definitions for this product. */
  async function persist(productId: string) {
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
      weight: num(v.extra.weight),
      wholesale_price: num(v.extra.wholesale_price),
      supplier_item_code: v.extra.supplier_item_code.trim() || null,
      min_stock: num(v.extra.min_stock),
      max_stock: num(v.extra.max_stock),
      reorder_level: num(v.extra.reorder_level) ?? 0,
      reorder_quantity: num(v.extra.reorder_quantity),
      bin_location: v.extra.bin_location.trim() || null,
    });

    for (const v of variants) {
      if (v.id) {
        const { error } = await db.from("product_variants").update(payload(v)).eq("id", v.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("product_variants").insert(payload(v));
        if (error) throw error;
      }
    }

    // Removed variants are archived, never hard-deleted when history exists.
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
    queryClient.invalidateQueries({ queryKey: ["product-variant-summary", businessId] });
    queryClient.invalidateQueries({ queryKey: ["resource", "products", businessId] });
    queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
  }

  function Section({
    parentCost,
    parentPrice,
    parentSku,
    parentDefaults,
  }: {
    parentCost: number;
    parentPrice: number;
    parentSku: string;
    parentDefaults?: Partial<VariantExtra>;
  }) {
    const activeCount = variants.filter((v) => v.status !== "archived").length;
    const totalStock = useMemo(
      () => variants.reduce((s, v) => s + Number(v.stock ?? 0), 0),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [variants],
    );

    function update(key: string, patch: Partial<VariantDraft>) {
      setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
    }

    function generate() {
      const combos = combinations(options);
      setVariants((prev) => {
        const seen = new Set(prev.map((v) => comboKey(v.attributes)));
        const added = combos
          .filter((c) => !seen.has(comboKey(c)))
          .map((attributes, i) => ({
            key: rid(),
            id: null,
            attributes,
            name: comboLabel(attributes),
            sku: parentSku
              ? `${parentSku}-${Object.values(attributes)
                  .map((v) => String(v).slice(0, 3).toUpperCase())
                  .join("-")}`
              : "",
            barcode: "",
            cost_price: parentCost,
            selling_price: parentPrice,
            stock: 0,
            status: "active",
            extra: {
              weight: num(parentDefaults?.weight),
              wholesale_price: num(parentDefaults?.wholesale_price),
              supplier_item_code: String(parentDefaults?.supplier_item_code ?? ""),
              min_stock: num(parentDefaults?.min_stock),
              max_stock: num(parentDefaults?.max_stock),
              reorder_level: num(parentDefaults?.reorder_level),
              reorder_quantity: num(parentDefaults?.reorder_quantity),
              bin_location: String(parentDefaults?.bin_location ?? ""),
            },
            overridden: false,
            _i: i,
          }));
        return [...prev, ...added.map(({ _i, ...v }) => v)];
      });
    }

    function remove(v: VariantDraft) {
      if (v.id) setRemoved((r) => [...r, v.id!]);
      setVariants((prev) => prev.filter((x) => x.key !== v.key));
    }

    const error = validate();

    return (
      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label className="text-xs font-semibold">Variants</Label>
            <p className="text-[11px] text-muted-foreground">
              Define your dimensions, then generate every combination. Stock is tracked per variant.
            </p>
          </div>
          <Badge variant="secondary">
            {activeCount} active · {totalStock} in stock
          </Badge>
        </div>

        <div className="space-y-2">
          {options.map((o) => (
            <div
              key={o.key}
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
            >
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Attribute</Label>
                <Input
                  value={o.name}
                  placeholder="Color"
                  onChange={(e) =>
                    setOptions((prev) =>
                      prev.map((x) => (x.key === o.key ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Values (comma separated)
                </Label>
                <Input
                  value={o.values}
                  placeholder="Black, White"
                  onChange={(e) =>
                    setOptions((prev) =>
                      prev.map((x) => (x.key === o.key ? { ...x, values: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove attribute"
                onClick={() => setOptions((prev) => prev.filter((x) => x.key !== o.key))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOptions((prev) => [...prev, newOption()])}
          >
            <Plus className="size-4" /> Add attribute
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={generate}>
            <Wand2 className="size-4" /> Generate combinations
          </Button>
        </div>

        {loading && <p className="text-xs text-muted-foreground">Loading variants…</p>}

        <div className="space-y-2">
          {variants.map((v) => (
            <div
              key={v.key}
              className={`grid grid-cols-2 items-end gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_90px_90px_auto] ${
                v.status === "archived" ? "opacity-60" : ""
              }`}
            >
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <Label className="mb-1 block text-[11px] text-muted-foreground">Variant</Label>
                <Input value={v.name} onChange={(e) => update(v.key, { name: e.target.value })} />
              </div>
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">SKU</Label>
                <Input value={v.sku} onChange={(e) => update(v.key, { sku: e.target.value })} />
              </div>
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">Barcode</Label>
                <Input
                  value={v.barcode}
                  onChange={(e) => update(v.key, { barcode: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Cost (this variant)
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={v.cost_price}
                  onChange={(e) =>
                    update(v.key, { cost_price: Number(e.target.value), overridden: true })
                  }
                />
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Selling price (this variant)
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={v.selling_price}
                  onChange={(e) =>
                    update(v.key, { selling_price: Number(e.target.value), overridden: true })
                  }
                />
              </div>
              <div className="col-span-2 flex items-center justify-between gap-1 sm:col-span-1 sm:justify-end">
                <span className="text-[11px] text-muted-foreground sm:hidden">
                  {v.stock} in stock
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={v.status === "archived" ? "Restore variant" : "Archive variant"}
                    title={v.status === "archived" ? "Restore variant" : "Archive variant"}
                    onClick={() =>
                      update(v.key, { status: v.status === "archived" ? "active" : "archived" })
                    }
                  >
                    {v.status === "archived" ? (
                      <ArchiveRestore className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove variant"
                    title="Removed variants with history are archived automatically"
                    onClick={() => remove(v)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-6 sm:grid-cols-4 lg:grid-cols-8">
                {EXTRA_KEYS.map((f) => (
                  <div key={f.key} className="min-w-0">
                    <Label className="mb-1 block text-[11px] text-muted-foreground">
                      {f.label}
                    </Label>
                    <Input
                      type={f.numeric ? "number" : "text"}
                      step="any"
                      value={(v.extra[f.key] ?? "") as string | number}
                      onChange={(e) =>
                        update(v.key, {
                          extra: {
                            ...v.extra,
                            [f.key]: f.numeric ? num(e.target.value) : e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    );
  }

  return { load, validate, persist, Section, variants, options };
}
