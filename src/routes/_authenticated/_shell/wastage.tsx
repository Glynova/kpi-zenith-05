import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
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

export const WASTE_REASONS = [
  "Spoiled",
  "Broken or spilled",
  "Expired",
  "Dropped",
  "Staff meal",
  "Returned by customer",
];

export const Route = createFileRoute("/_authenticated/_shell/wastage")({
  head: () => ({
    meta: [
      { title: "Wastage — Daraven ERP" },
      {
        name: "description",
        content: "Record spoiled, dropped or expired stock and see what it costs.",
      },
      { property: "og:title", content: "Wastage — Daraven ERP" },
      {
        property: "og:description",
        content: "Record spoiled, dropped or expired stock and see what it costs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WastagePage,
});

function WastagePage() {
  const { business } = useBusiness();
  const businessId = business?.id as string | undefined;
  const currency = String(business?.currency ?? "USD");
  const qc = useQueryClient();
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["wastage", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [p, v, w] = await Promise.all([
        db
          .from("products")
          .select("id,name,unit,cost_price,average_cost,item_type,status")
          .eq("business_id", businessId)
          .order("name"),
        db
          .from("product_variants")
          .select("id,product_id,name,cost_price")
          .eq("business_id", businessId),
        db
          .from("wastage_entries")
          .select("id,product_id,variant_id,quantity,total_cost,reason,note,created_at")
          .eq("business_id", businessId)
          .gte("created_at", start.toISOString())
          .order("created_at", { ascending: false }),
      ]);
      return {
        products: ((p.data ?? []) as Row[]).filter(
          (x) => x.status !== "inactive" && !["service", "package"].includes(String(x.item_type)),
        ),
        variants: (v.data ?? []) as Row[],
        today: (w.data ?? []) as Row[],
      };
    },
  });

  const product = data?.products.find((p) => p.id === productId);
  const variants = (data?.variants ?? []).filter((v) => v.product_id === productId);
  const variant = variants.find((v) => v.id === variantId);
  const unitCost = Number(variant?.cost_price || product?.average_cost || product?.cost_price || 0);
  const preview = unitCost * Number(qty || 0);
  const name = (id: string, vid?: string | null) => {
    const p = data?.products.find((x) => x.id === id);
    const v = data?.variants.find((x) => x.id === vid);
    return `${p?.name ?? "Item"}${v ? `, ${v.name}` : ""}`;
  };
  const total = (data?.today ?? []).reduce((s, w) => s + Number(w.total_cost), 0);
  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data?.today ?? [])
      m.set(String(w.reason), (m.get(String(w.reason)) ?? 0) + Number(w.total_cost));
    return [...m.entries()];
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Choose an item");
      if (variants.length && !variantId) throw new Error("Choose a variant");
      if (!(Number(qty) > 0)) throw new Error("Enter a quantity above zero");
      if (!reason) throw new Error("Choose a reason");
      const { error } = await db.rpc("record_wastage", {
        _product_id: productId,
        _variant_id: variantId || null,
        _quantity: Number(qty),
        _reason: reason,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wastage recorded");
      setQty("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["wastage", businessId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmt = (n: number) => formatCurrency(n, currency);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Wastage"
        description="Record spoiled, dropped or expired stock. Its cost goes to your expenses."
      />
      <section className="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Item</Label>
          <Select
            value={productId}
            onValueChange={(v) => {
              setProductId(v);
              setVariantId("");
            }}
          >
            <SelectTrigger aria-label="Item">
              <SelectValue placeholder="Choose an item" />
            </SelectTrigger>
            <SelectContent>
              {(data?.products ?? []).map((p) => (
                <SelectItem key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {variants.length > 0 && (
          <div className="space-y-1.5">
            <Label>Variant</Label>
            <Select value={variantId} onValueChange={setVariantId}>
              <SelectTrigger aria-label="Variant">
                <SelectValue placeholder="Choose a variant" />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={String(v.id)} value={String(v.id)}>
                    {String(v.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="w-qty">Quantity {product ? `(${product.unit ?? "pcs"})` : ""}</Label>
          <Input
            id="w-qty"
            type="number"
            min={0}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label="Reason">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              {WASTE_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="w-note">Note (optional)</Label>
          <Input id="w-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex items-end justify-between gap-3 sm:col-span-2">
          <p className="text-sm text-muted-foreground">
            Cost of this waste: <strong>{fmt(preview)}</strong>
          </p>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Record wastage"}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Today</h3>
          <p className="text-sm">
            Total <strong>{fmt(total)}</strong>
          </p>
        </div>
        {byReason.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {byReason.map(([r, v]) => (
              <span key={r} className="rounded-full border border-border px-2 py-1">
                {r}: {fmt(v)}
              </span>
            ))}
          </div>
        )}
        <div className="divide-y divide-border rounded-md border border-border">
          {(data?.today ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nothing wasted today.</p>
          )}
          {(data?.today ?? []).map((w) => (
            <div key={String(w.id)} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium">
                  {name(String(w.product_id), w.variant_id as string | null)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(Number(w.quantity))} · {String(w.reason)}
                  {w.note ? ` · ${w.note}` : ""}
                </p>
              </div>
              <span>{fmt(Number(w.total_cost))}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
