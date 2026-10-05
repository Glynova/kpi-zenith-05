import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { db, type Row } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { normalizeUnit, toStockUnit, unitsFor } from "@/lib/units";

export type MadeFromLine = {
  key: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unit: string;
  waste: number;
};
export const newLine = (): MadeFromLine => ({
  key: crypto.randomUUID(),
  productId: "",
  variantId: null,
  quantity: 1,
  unit: "",
  waste: 0,
});

export type ComponentOption = {
  value: string;
  productId: string;
  variantId: string | null;
  label: string;
  unit: string;
  cost: number;
  onHand: number;
};

export function useComponentOptions(businessId: string | null) {
  return useQuery({
    queryKey: ["made-from-options", businessId],
    enabled: !!businessId,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async (): Promise<ComponentOption[]> => {
      const [products, variants] = await Promise.all([
        db
          .from("products")
          .select("id,name,unit,cost_price,average_cost,stock,item_type,has_variants,status")
          .eq("business_id", businessId),
        db
          .from("product_variants")
          .select("id,product_id,name,sku,cost_price,stock,status")
          .eq("business_id", businessId),
      ]);
      const vs = ((variants.data ?? []) as Row[]).filter((v) => v.status !== "archived");
      const out: ComponentOption[] = [];
      for (const p of (products.data ?? []) as Row[]) {
        if (p.item_type === "service") continue;
        const own = vs.filter((v) => v.product_id === p.id);
        const base = Number(p.cost_price) || Number(p.average_cost) || 0;
        if (own.length) {
          for (const v of own)
            out.push({
              value: `${p.id}:${v.id}`,
              productId: p.id,
              variantId: v.id,
              label: `${p.name}, ${v.name}`,
              unit: normalizeUnit(p.unit),
              cost: Number(v.cost_price) || base,
              onHand: Number(v.stock ?? 0),
            });
        } else
          out.push({
            value: p.id,
            productId: p.id,
            variantId: null,
            label: String(p.name),
            unit: normalizeUnit(p.unit),
            cost: base,
            onHand: Number(p.stock ?? 0),
          });
      }
      return out.sort((a, b) => a.label.localeCompare(b.label));
    },
  });
}

const optionValue = (l: MadeFromLine) =>
  l.variantId ? `${l.productId}:${l.variantId}` : l.productId;

/** Stock-unit quantity per output batch, or null when the unit cannot convert. */
export function stockQty(line: MadeFromLine, opt?: ComponentOption) {
  if (!opt) return null;
  return toStockUnit(Number(line.quantity), line.unit || opt.unit, opt.unit);
}

export function madeFromCost(lines: MadeFromLine[], options: ComponentOption[]) {
  let material = 0;
  let servings = Infinity;
  let limiting = "";
  for (const l of lines) {
    const opt = options.find((o) => o.value === optionValue(l));
    const q = stockQty(l, opt);
    if (!opt || q == null) continue;
    const need = q * (1 + Number(l.waste || 0) / 100);
    material += need * opt.cost;
    if (need > 0) {
      const can = Math.floor(Math.max(opt.onHand, 0) / need);
      if (can < servings) {
        servings = can;
        limiting = opt.label;
      }
    }
  }
  return { material, servings: servings === Infinity ? 0 : servings, limiting };
}

type Props = {
  businessId: string | null;
  excludeId?: string;
  lines: MadeFromLine[];
  setLines: (lines: MadeFromLine[]) => void;
  currency: string;
  form: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  showWaste: boolean;
  showLabor: boolean;
  title: string;
  canProduce: boolean;
};

export function MadeFromSection({
  businessId,
  excludeId,
  lines,
  setLines,
  currency,
  form,
  set,
  showWaste,
  showLabor,
  title,
  canProduce,
}: Props) {
  const queryClient = useQueryClient();
  const { data: options = [] } = useComponentOptions(businessId);
  const [batch, setBatch] = useState(10);
  const [producing, setProducing] = useState(false);
  const update = (key: string, patch: Partial<MadeFromLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const output = Number(form.output_quantity) > 0 ? Number(form.output_quantity) : 1;
  const { material, servings, limiting } = madeFromCost(lines, options);
  const labor = Number(form.labor_hours || 0) * Number(form.labor_rate || 0);
  const unitCost = (material + labor) / output + Number(form.overhead_per_unit || 0);
  const price = Number(form.selling_price || 0);
  const profit = price - unitCost;
  const onProduction = form.consumption_mode === "on_production";
  const fmt = (n: number) => formatCurrency(n, currency);

  async function produce() {
    setProducing(true);
    try {
      const { error } = await db.rpc("produce_made_from", {
        _product_id: excludeId,
        _quantity: Number(batch),
      });
      if (error) throw error;
      toast.success(`Made ${batch} ${form.unit || "units"} of ${form.name || "this item"}`);
      void queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Could not make the batch");
    } finally {
      setProducing(false);
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines([...lines, newLine()])}
        >
          Add line
        </Button>
      </div>
      {lines.map((line) => {
        const opt = options.find((o) => o.value === optionValue(line));
        const unit = line.unit || opt?.unit || "pcs";
        const q = stockQty(line, opt);
        const need = q == null ? null : q * (1 + Number(line.waste || 0) / 100);
        return (
          <div key={line.key} className="space-y-1 rounded-md border border-border/60 p-2">
            <div
              className={`grid items-end gap-2 ${showWaste ? "grid-cols-[minmax(0,1fr)_80px_90px_70px_auto]" : "grid-cols-[minmax(0,1fr)_80px_90px_auto]"}`}
            >
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">Item</Label>
                <Select
                  value={optionValue(line) || "none"}
                  onValueChange={(v) => {
                    const o = options.find((x) => x.value === v);
                    update(line.key, {
                      productId: o?.productId ?? "",
                      variantId: o?.variantId ?? null,
                      unit: o?.unit ?? "",
                    });
                  }}
                >
                  <SelectTrigger aria-label="Component item">
                    <SelectValue placeholder="Choose an item" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose an item</SelectItem>
                    {options
                      .filter((o) => o.productId !== excludeId)
                      .map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  aria-label="Component quantity"
                  value={line.quantity}
                  onChange={(e) => update(line.key, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select value={unit} onValueChange={(v) => update(line.key, { unit: v })}>
                  <SelectTrigger aria-label="Component unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitsFor(opt?.unit ?? unit).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showWaste && (
                <div className="space-y-1">
                  <Label className="text-xs">Waste %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    aria-label="Extra for waste"
                    value={line.waste}
                    onChange={(e) => update(line.key, { waste: Number(e.target.value) })}
                  />
                </div>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove line"
                onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
              >
                ×
              </Button>
            </div>
            {opt && (
              <p className="text-xs text-muted-foreground">
                On hand {opt.onHand} {opt.unit}
                {q != null && normalizeUnit(unit) !== opt.unit && ` · = ${q} ${opt.unit}`}
                {need != null && ` · costs ${fmt(need * opt.cost)}`}
                {q == null && (
                  <span className="text-destructive">
                    {" "}
                    · {unit} can't convert to {opt.unit}
                  </span>
                )}
                {Number(line.waste) > 50 && (
                  <span className="text-destructive"> · waste over 50%</span>
                )}
              </p>
            )}
          </div>
        );
      })}
      {!lines.length && (
        <p className="text-sm text-muted-foreground">Add what this item is made from.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Makes (output quantity)</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={form.output_quantity ?? 1}
            onChange={(e) => set("output_quantity", e.target.value)}
          />
        </div>
        {showLabor && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Labor hours</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.labor_hours ?? 0}
                onChange={(e) => set("labor_hours", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Labor rate per hour</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.labor_rate ?? 0}
                onChange={(e) => set("labor_rate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Overhead per unit</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.overhead_per_unit ?? 0}
                onChange={(e) => set("overhead_per_unit", e.target.value)}
              />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-xs">When are components used?</Label>
          <Select
            value={String(form.consumption_mode || "on_sale")}
            onValueChange={(v) => set("consumption_mode", v)}
          >
            <SelectTrigger aria-label="Consumption mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on_sale">When sold (no own stock)</SelectItem>
              <SelectItem value="on_production">Made ahead in batches</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-4">
        <Stat label="Cost per unit" value={fmt(unitCost)} />
        <Stat
          label="Profit"
          value={price > 0 ? fmt(profit) : "Set a price"}
          danger={price > 0 && profit < 0}
        />
        <Stat
          label="Margin"
          value={price > 0 ? `${((profit / price) * 100).toFixed(1)}%` : "Set a price"}
          danger={price > 0 && profit < 0}
        />
        <Stat
          label="Stock covers"
          value={lines.length ? `${servings * output} units` : "—"}
          hint={limiting ? `Limited by ${limiting}` : undefined}
        />
      </div>
      {price > 0 && profit < 0 && (
        <p className="text-sm text-destructive">Price is below cost. You can still save.</p>
      )}

      {onProduction && canProduce && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Make a batch of</Label>
            <Input
              type="number"
              min="1"
              step="any"
              className="w-28"
              value={batch}
              onChange={(e) => setBatch(Number(e.target.value))}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={producing || !(batch > 0)}
            onClick={() => void produce()}
          >
            {producing ? "Making…" : "Make batch"}
          </Button>
          <BatchCheck lines={lines} options={options} batch={batch} output={output} />
        </div>
      )}
    </section>
  );
}

function BatchCheck({
  lines,
  options,
  batch,
  output,
}: {
  lines: MadeFromLine[];
  options: ComponentOption[];
  batch: number;
  output: number;
}) {
  const shortages = lines.flatMap((l) => {
    const opt = options.find((o) => o.value === optionValue(l));
    const q = stockQty(l, opt);
    if (!opt || q == null) return [];
    const need = (q * (1 + Number(l.waste || 0) / 100) * batch) / output;
    const short = need - opt.onHand;
    return short > 0 ? [`${opt.label}: short by ${Math.round(short * 100) / 100} ${opt.unit}`] : [];
  });
  return (
    <p className={`text-xs ${shortages.length ? "text-destructive" : "text-muted-foreground"}`}>
      {shortages.length ? shortages.join(" · ") : "Enough stock for this batch."}
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
