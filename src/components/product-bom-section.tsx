/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, RefreshCw, Factory } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BomComponent = {
  key: string;
  component_product_id: string | null;
  quantity: number;
};

function newComponent(): BomComponent {
  return { key: Math.random().toString(36).slice(2), component_product_id: null, quantity: 1 };
}

/** Cost Price = Σ(component cost × quantity) ÷ output quantity. */
export function bomUnitCost(
  components: BomComponent[],
  outputQuantity: number,
  costOf: (productId: string) => number,
) {
  const qty = Number(outputQuantity);
  if (!qty || qty <= 0) return 0;
  const total = components.reduce(
    (sum, c) =>
      sum + (c.component_product_id ? costOf(c.component_product_id) * Number(c.quantity || 0) : 0),
    0,
  );
  return total / qty;
}

/**
 * Bill of materials editor embedded in the product form. Reads and writes the
 * same `bill_of_materials` + `bom_items` records as the standalone BOM module.
 */
export function useProductBom(businessId: string | null, currency: string) {
  const queryClient = useQueryClient();
  const [components, setComponents] = useState<BomComponent[]>([newComponent()]);
  const [outputQuantity, setOutputQuantity] = useState<number>(1);
  const [bomId, setBomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["bom-component-products", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id,name,cost_price,average_cost")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const costOf = useCallback(
    (id: string) => {
      const p = products.find((x) => x.id === id);
      // Mirrors recalc_product_cost_from_bom(): actual average cost wins.
      return Number(p?.average_cost || p?.cost_price || 0);
    },
    [products],
  );

  const cost = useMemo(
    () => bomUnitCost(components, outputQuantity, costOf),
    [components, outputQuantity, costOf],
  );

  /** Load the existing BOM for a product (or reset for a new product). */
  const load = useCallback(async (row: Row | null) => {
    setBomId(null);
    setComponents([newComponent()]);
    setOutputQuantity(1);
    if (!row?.id) return;
    setLoading(true);
    try {
      const { data: bom } = await db
        .from("bill_of_materials")
        .select("id,output_quantity")
        .eq("product_id", row.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!bom) return;
      setBomId(bom.id);
      setOutputQuantity(Number(bom.output_quantity ?? 1));
      const { data: items } = await db
        .from("bom_items")
        .select("id,component_product_id,quantity")
        .eq("bom_id", bom.id);
      const list = (items ?? []).map((i: Row) => ({
        key: i.id,
        component_product_id: i.component_product_id,
        quantity: Number(i.quantity),
      }));
      setComponents(list.length ? list : [newComponent()]);
    } finally {
      setLoading(false);
    }
  }, []);

  const validComponents = useMemo(
    () => components.filter((c) => c.component_product_id && Number(c.quantity) > 0),
    [components],
  );

  function validate(): string | null {
    if (!validComponents.length) return "Add at least one component with a quantity above zero";
    if (!(Number(outputQuantity) > 0)) return "Output quantity must be greater than zero";
    return null;
  }

  /** Create or update the BOM records for this finished product. */
  async function persist(productId: string, productName: string) {
    const payload = {
      business_id: businessId,
      product_id: productId,
      name: productName || "Recipe",
      type: "recipe",
      output_quantity: Number(outputQuantity),
    };

    let id = bomId;
    if (id) {
      const { error } = await db.from("bill_of_materials").update(payload).eq("id", id);
      if (error) throw error;
      const { error: delError } = await db.from("bom_items").delete().eq("bom_id", id);
      if (delError) throw delError;
    } else {
      const { data, error } = await db
        .from("bill_of_materials")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
      setBomId(id);
    }

    const { error: itemsError } = await db.from("bom_items").insert(
      validComponents.map((c) => ({
        business_id: businessId,
        bom_id: id,
        component_product_id: c.component_product_id,
        quantity: Number(c.quantity),
      })),
    );
    if (itemsError) throw itemsError;

    await db.rpc("recalc_product_cost_from_bom", { _product_id: productId });
    queryClient.invalidateQueries({ queryKey: ["boms", businessId] });
    queryClient.invalidateQueries({ queryKey: ["bom-items", businessId] });
    queryClient.invalidateQueries({ queryKey: ["bom-component-products", businessId] });
  }

  function Section({
    excludeProductId,
    productName,
    onCostChange,
  }: {
    excludeProductId?: string | null;
    productName?: string;
    onCostChange: (cost: number) => void;
  }) {
    const [batches, setBatches] = useState(1);
    const [producing, setProducing] = useState(false);

    function update(next: BomComponent[]) {
      setComponents(next);
      onCostChange(bomUnitCost(next, outputQuantity, costOf));
    }

    async function produce() {
      if (!bomId) return;
      setProducing(true);
      try {
        const { data, error } = await db.rpc("produce_from_bom", {
          _bom_id: bomId,
          _batches: Number(batches),
        });
        if (error) throw error;
        toast.success(`Produced ${Number(data ?? 0)} units of ${productName || "this product"}`);
        queryClient.invalidateQueries({ queryKey: ["resource", "products", businessId] });
        queryClient.invalidateQueries({ queryKey: ["bom-component-products", businessId] });
        queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
      } catch (e: any) {
        toast.error(e?.message ?? "Production failed");
      } finally {
        setProducing(false);
      }
    }

    const options = products.filter((p) => p.id !== excludeProductId);
    const error = validate();

    return (
      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-semibold">Components</Label>
          <div className="flex items-center gap-2">
            {bomId && (
              <>
                <Label className="text-[11px] text-muted-foreground">Batches</Label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  className="h-9 w-20"
                  value={batches}
                  onChange={(e) => setBatches(Number(e.target.value))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={producing || !(Number(batches) > 0)}
                  onClick={() => void produce()}
                >
                  <Factory className="size-4" /> {producing ? "Producing…" : "Produce"}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update([...components, newComponent()])}
            >
              <Plus className="size-4" /> Add component
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Output quantity</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={outputQuantity}
              onChange={(e) => {
                const qty = Number(e.target.value);
                setOutputQuantity(qty);
                onCostChange(bomUnitCost(components, qty, costOf));
              }}
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-muted-foreground">Recipe unit cost</Label>
            <div className="flex h-9 items-center gap-2">
              <span className="text-sm font-medium tabular-nums">
                {formatCurrency(cost, currency)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onCostChange(bomUnitCost(components, outputQuantity, costOf))}
              >
                <RefreshCw className="size-3.5" /> Recalculate cost
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Loading components…</p>}
          {components.map((c) => (
            <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-end gap-2">
              <div className="min-w-0">
                <Label className="mb-1 block text-[11px] text-muted-foreground">Component</Label>
                <Select
                  value={c.component_product_id ?? undefined}
                  onValueChange={(v) =>
                    update(
                      components.map((x) =>
                        x.key === c.key ? { ...x, component_product_id: v } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select component" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} —{" "}
                        {formatCurrency(Number(p.average_cost || p.cost_price || 0), currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Qty</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={c.quantity}
                  onChange={(e) =>
                    update(
                      components.map((x) =>
                        x.key === c.key ? { ...x, quantity: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove component"
                onClick={() => update(components.filter((x) => x.key !== c.key))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return { components, outputQuantity, cost, load, validate, persist, Section };
}
