/**
 * Supplier (purchase) return dialog.
 *
 * Built from the original purchase order so the exact purchased identity is
 * preserved: product_id, variant_id and unit_cost are copied from the ordered
 * line, and the quantity is capped at what was actually received minus what has
 * already been returned. The database function `post_purchase_return()` is the
 * only thing that writes stock movements and the supplier credit, so stock is
 * never adjusted from the browser and a return can never post twice.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, todayISO } from "@/lib/format";
import { nextDocNumber, round2 } from "@/lib/purchasing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReturnLine = {
  key: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  sku: string;
  unit_cost: number;
  returnable: number;
  quantity: number;
};

export function SupplierReturnDialog({
  order,
  onOpenChange,
}: {
  order: Row | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { businessId, currency, userId } = useBusiness();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!order?.id) {
      setLines([]);
      setReason("");
      return;
    }
    setLoading(true);
    void (async () => {
      const [items, returns] = await Promise.all([
        db
          .from("purchase_order_items")
          .select("*, products(name,sku), product_variants(name,sku)")
          .eq("purchase_order_id", order.id),
        db
          .from("purchase_returns")
          .select("id, purchase_return_items(product_id,variant_id,quantity)")
          .eq("purchase_order_id", order.id),
      ]);
      if (cancelled) return;

      // Already-returned quantities per exact sellable identity.
      const returned = new Map<string, number>();
      for (const r of (returns.data ?? []) as Row[]) {
        for (const ri of (r.purchase_return_items ?? []) as Row[]) {
          const k = `${ri.product_id}::${ri.variant_id ?? ""}`;
          returned.set(k, (returned.get(k) ?? 0) + Number(ri.quantity ?? 0));
        }
      }

      setLines(
        ((items.data ?? []) as Row[]).map((it) => {
          const key = `${it.product_id}::${it.variant_id ?? ""}`;
          const product = it.products as Row | null;
          const variant = it.product_variants as Row | null;
          const received = Number(it.received_quantity ?? 0);
          return {
            key: String(it.id),
            product_id: String(it.product_id),
            variant_id: (it.variant_id as string | null) ?? null,
            name: variant?.name
              ? `${product?.name ?? "Item"} — ${variant.name}`
              : (product?.name ?? "Item"),
            sku: String(variant?.sku ?? product?.sku ?? it.supplier_sku ?? ""),
            unit_cost: Number(it.unit_cost ?? 0),
            returnable: Math.max(round2(received - (returned.get(key) ?? 0)), 0),
            quantity: 0,
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.id]);

  const total = useMemo(
    () => round2(lines.reduce((a, l) => a + (l.quantity > 0 ? l.quantity * l.unit_cost : 0), 0)),
    [lines],
  );

  function setLine(index: number, patch: Partial<ReturnLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("No purchase order selected");
      const picked = lines.filter((l) => Number(l.quantity) > 0);
      if (!picked.length) throw new Error("Enter a quantity for at least one item");
      for (const l of picked) {
        if (l.quantity > l.returnable + 0.0001)
          throw new Error(`${l.name}: only ${l.returnable} received and not yet returned`);
      }
      if (!reason.trim()) throw new Error("A return reason is required");

      const number = await nextDocNumber(businessId!, "PRET");
      const { data: ret, error } = await db
        .from("purchase_returns")
        .insert({
          business_id: businessId,
          return_number: number,
          supplier_id: order.supplier_id ?? null,
          purchase_order_id: order.id,
          warehouse_id: order.warehouse_id ?? null,
          return_date: todayISO(),
          reason: reason.trim(),
          total: 0,
          status: "draft",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from("purchase_return_items").insert(
        picked.map((l) => ({
          business_id: businessId,
          return_id: ret.id,
          // Exact purchased identity carried over from the ordered line.
          product_id: l.product_id,
          variant_id: l.variant_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          total: round2(l.quantity * l.unit_cost),
          reason: reason.trim(),
        })),
      );
      if (itemsError) {
        await db.from("purchase_returns").delete().eq("id", ret.id);
        throw itemsError;
      }

      const { error: postError } = await db.rpc("post_purchase_return", { _return_id: ret.id });
      if (postError) throw postError;
      return ret;
    },
    onSuccess: () => {
      toast.success("Return to supplier posted — stock reduced and a supplier credit raised");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
      queryClient.invalidateQueries({ queryKey: ["reports", businessId] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not post the supplier return"),
  });

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Return goods to supplier — {order?.po_number ?? ""}</DialogTitle>
          <DialogDescription>
            Choose what is going back. Stock is reduced for the exact item or variant that was
            received, and a supplier credit is raised for the value returned.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading the received items…</p>
        ) : lines.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">This order has no items.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Returnable</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.key}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.sku || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.returnable}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(l.unit_cost, currency)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={l.returnable}
                        step="any"
                        value={l.quantity || ""}
                        disabled={l.returnable <= 0}
                        onChange={(e) =>
                          setLine(i, { quantity: Math.max(Number(e.target.value) || 0, 0) })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="supplier-return-reason">Reason</Label>
          <Textarea
            id="supplier-return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are these goods going back to the supplier?"
          />
        </div>

        <div className="flex justify-end text-sm font-semibold">
          Credit total {formatCurrency(total, currency)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || loading}>
            {submit.isPending ? "Posting…" : "Post return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
