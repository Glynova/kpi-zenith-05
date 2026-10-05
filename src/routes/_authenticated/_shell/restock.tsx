import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber, todayISO } from "@/lib/format";
import { nextDocNumber, round2 } from "@/lib/purchasing";
import { needsRestock, suggestedPurchaseQty } from "@/lib/restock";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/_shell/restock")({
  head: () => ({
    meta: [
      { title: "Restock list — Daraven ERP" },
      {
        name: "description",
        content: "Items at or below their alert level, with suggested orders.",
      },
      { property: "og:title", content: "Restock list — Daraven ERP" },
      {
        property: "og:description",
        content: "Items at or below their alert level, with suggested orders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RestockPage,
});

type Line = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  unit: string;
  purchaseUnit: string;
  conv: number;
  onHand: number;
  alert: number;
  supplierId: string | null;
  supplierName: string;
  qty: number; // purchase units
  price: number; // per purchase unit
};

function RestockPage() {
  const { business } = useBusiness();
  const businessId = business?.id as string | undefined;
  const currency = String(business?.currency ?? "USD");
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["restock", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [p, v, b, s, poi] = await Promise.all([
        db
          .from("products")
          .select(
            "id,name,unit,purchase_unit,purchase_conversion,reorder_level,reorder_quantity,max_stock,supplier_id,cost_price,track_stock,has_variants,status,consumption_mode,item_type",
          )
          .eq("business_id", businessId),
        db
          .from("product_variants")
          .select("id,product_id,name,reorder_level,reorder_quantity,max_stock,cost_price,status")
          .eq("business_id", businessId),
        db
          .from("inventory_balances")
          .select("product_id,variant_id,quantity")
          .eq("business_id", businessId),
        db.from("suppliers").select("id,name").eq("business_id", businessId),
        db
          .from("purchase_order_items")
          .select("product_id,variant_id,unit_cost,created_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      return {
        products: (p.data ?? []) as Row[],
        variants: (v.data ?? []) as Row[],
        balances: (b.data ?? []) as Row[],
        suppliers: (s.data ?? []) as Row[],
        lastCosts: (poi.data ?? []) as Row[],
      };
    },
  });

  const { lines, fineCount } = useMemo(() => {
    if (!data) return { lines: [] as Line[], fineCount: 0 };
    const onHand = new Map<string, number>();
    for (const b of data.balances) {
      const k = `${b.product_id}:${b.variant_id ?? ""}`;
      onHand.set(k, (onHand.get(k) ?? 0) + Number(b.quantity ?? 0));
    }
    const last = new Map<string, number>();
    for (const c of data.lastCosts) {
      const k = `${c.product_id}:${c.variant_id ?? ""}`;
      if (!last.has(k)) last.set(k, Number(c.unit_cost ?? 0));
    }
    const sup = new Map(data.suppliers.map((s) => [String(s.id), String(s.name)]));
    const out: Line[] = [];
    let fine = 0;
    for (const p of data.products) {
      if (p.status && p.status !== "active") continue;
      if (p.track_stock === false) continue;
      if (p.consumption_mode === "on_sale" || ["service", "package"].includes(String(p.item_type)))
        continue;
      const conv = Number(p.purchase_conversion ?? 1) || 1;
      const vs = data.variants.filter((v) => v.product_id === p.id && v.status !== "inactive");
      const rows =
        p.has_variants && vs.length ? vs.map((v) => ({ v })) : [{ v: null as Row | null }];
      for (const { v } of rows) {
        const alert = Number(v?.reorder_level ?? p.reorder_level ?? 0);
        const key = `${p.id}:${v?.id ?? ""}`;
        const qtyOnHand = onHand.get(key) ?? 0;
        if (alert <= 0) continue;
        if (!needsRestock({ onHand: qtyOnHand, alertLevel: alert })) {
          fine++;
          continue;
        }
        const stockCost = last.get(key) ?? Number(v?.cost_price ?? p.cost_price ?? 0);
        out.push({
          key,
          productId: String(p.id),
          variantId: v ? String(v.id) : null,
          name: v ? `${p.name}, ${v.name}` : String(p.name),
          unit: String(p.unit ?? "pcs"),
          purchaseUnit: String(p.purchase_unit || p.unit || "pcs"),
          conv,
          onHand: qtyOnHand,
          alert,
          supplierId: p.supplier_id ? String(p.supplier_id) : null,
          supplierName: p.supplier_id ? (sup.get(String(p.supplier_id)) ?? "—") : "",
          qty: suggestedPurchaseQty({
            onHand: qtyOnHand,
            alertLevel: alert,
            reorderQuantity: Number(v?.reorder_quantity ?? p.reorder_quantity ?? 0),
            maxStock: Number(v?.max_stock ?? p.max_stock ?? 0),
            purchaseConversion: conv,
          }),
          price: round2(stockCost * (last.has(key) ? 1 : conv)),
        });
      }
    }
    return { lines: out, fineCount: fine };
  }, [data]);

  const selected = lines.filter((l) => picked.has(l.key));
  const orderable = selected.filter((l) => l.supplierId && l.price > 0 && l.qty > 0);
  const bySupplier = new Map<string, { name: string; total: number; lines: Line[] }>();
  for (const l of orderable) {
    const g = bySupplier.get(l.supplierId!) ?? { name: l.supplierName, total: 0, lines: [] };
    g.total += l.qty * l.price;
    g.lines.push(l);
    bySupplier.set(l.supplierId!, g);
  }

  const create = useMutation({
    mutationFn: async () => {
      for (const [supplierId, g] of bySupplier) {
        const number = await nextDocNumber(businessId!, "PO");
        const subtotal = round2(g.total);
        const { data: po, error } = await db
          .from("purchase_orders")
          .insert({
            business_id: businessId,
            supplier_id: supplierId,
            po_number: number,
            status: "draft",
            order_date: todayISO(),
            currency,
            subtotal,
            tax: 0,
            total: subtotal,
            paid: 0,
            notes: "Created from the restock list",
          })
          .select("id")
          .single();
        if (error) throw error;
        const { error: e2 } = await db.from("purchase_order_items").insert(
          g.lines.map((l) => ({
            business_id: businessId,
            purchase_order_id: po.id,
            product_id: l.productId,
            variant_id: l.variantId,
            unit: l.purchaseUnit,
            quantity: l.qty,
            received_quantity: 0,
            unit_cost: l.price,
            total: round2(l.qty * l.price),
          })),
        );
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(`${bySupplier.size} draft order${bySupplier.size === 1 ? "" : "s"} created`);
      setPicked(new Set());
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmt = (n: number) => formatCurrency(n, currency);
  const toggle = (k: string) => {
    const n = new Set(picked);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPicked(n);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Restock list" description="Items at or below their alert level." />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !lines.length ? (
        <EmptyState title="Nothing to restock" description={`${fineCount} items are fine.`} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">
                    <Checkbox
                      aria-label="Select all"
                      checked={picked.size === lines.length}
                      onCheckedChange={(v) =>
                        setPicked(v ? new Set(lines.map((l) => l.key)) : new Set())
                      }
                    />
                  </th>
                  <th className="p-3">Item</th>
                  <th className="p-3">Supplier</th>
                  <th className="p-3 text-right">Suggested</th>
                  <th className="p-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t border-border">
                    <td className="p-3">
                      <Checkbox
                        aria-label={`Select ${l.name}`}
                        checked={picked.has(l.key)}
                        onCheckedChange={() => toggle(l.key)}
                      />
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatNumber(l.onHand)} {l.unit} left, alert at {formatNumber(l.alert)}
                      </p>
                    </td>
                    <td className="p-3">
                      {l.supplierName || (
                        <Link to="/products" className="text-xs text-destructive underline">
                          Set a supplier
                        </Link>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {l.qty} {l.purchaseUnit}
                    </td>
                    <td className="p-3 text-right">
                      {l.price > 0 ? (
                        fmt(l.qty * l.price)
                      ) : (
                        <span className="text-xs text-destructive">Set a purchase price</span>
                      )}
                      {l.conv !== 1 && (
                        <p className="text-xs text-muted-foreground">
                          = {formatNumber(l.qty * l.conv)} {l.unit}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{fineCount} other items are fine.</p>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
            <div className="text-sm">
              {[...bySupplier.values()].map((g) => (
                <span key={g.name} className="mr-4">
                  {g.name}: <strong>{fmt(g.total)}</strong>
                </span>
              ))}
              {selected.length > orderable.length && (
                <span className="text-xs text-destructive">
                  {selected.length - orderable.length} selected need a supplier or price.
                </span>
              )}
            </div>
            <Button disabled={!bySupplier.size || create.isPending} onClick={() => create.mutate()}>
              {create.isPending
                ? "Creating…"
                : `Create ${bySupplier.size} order${bySupplier.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
