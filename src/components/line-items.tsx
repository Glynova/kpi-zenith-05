/* eslint-disable @typescript-eslint/no-explicit-any */
import { Plus, Trash2 } from "lucide-react";

import type { Row } from "@/lib/db";
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

export type LineItem = {
  key: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount: number;
};

export function emptyLine(): LineItem {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: null,
    product_name: "",
    quantity: 1,
    unit_price: 0,
    unit_cost: 0,
    discount: 0,
  };
}

export function lineTotal(item: LineItem) {
  return Math.max(0, item.quantity * item.unit_price - item.discount);
}

export function itemsSubtotal(items: LineItem[]) {
  return items.reduce((sum, i) => sum + lineTotal(i), 0);
}

export function itemsCost(items: LineItem[]) {
  return items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
}

export function LineItemsEditor({
  items,
  setItems,
  products,
  currency,
  priceKey = "selling_price",
  priceLabel = "Unit price",
}: {
  items: LineItem[];
  setItems: (items: LineItem[]) => void;
  products: Row[];
  currency: string;
  priceKey?: "selling_price" | "cost_price";
  priceLabel?: string;
}) {
  function update(key: string, patch: Partial<LineItem>) {
    setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function pickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    update(key, {
      product_id: productId,
      product_name: p?.name ?? "",
      unit_price: Number(p?.[priceKey] ?? 0),
      unit_cost: Number(p?.cost_price ?? 0),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Line items</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setItems([...items, emptyLine()])}
        >
          <Plus className="size-4" /> Add line
        </Button>
      </div>

      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No line items yet. Add one to build this document.
        </p>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,2fr)_80px_110px_100px_auto]"
          >
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <Label className="mb-1 block text-[11px] text-muted-foreground">Product</Label>
              <Select
                value={item.product_id ?? undefined}
                onValueChange={(v) => pickProduct(item.key, v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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
                value={item.quantity}
                onChange={(e) => update(item.key, { quantity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">{priceLabel}</Label>
              <Input
                type="number"
                step="any"
                value={item.unit_price}
                onChange={(e) => update(item.key, { unit_price: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="mb-1 block text-[11px] text-muted-foreground">Discount</Label>
              <Input
                type="number"
                step="any"
                value={item.discount}
                onChange={(e) => update(item.key, { discount: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="text-sm font-medium tabular-nums">
                {formatCurrency(lineTotal(item), currency)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setItems(items.filter((i) => i.key !== item.key))}
                aria-label="Remove line"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
