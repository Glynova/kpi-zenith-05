/**
 * Sales return dialog.
 *
 * Returns are created from the original sale so the exact sellable identity is
 * preserved: product_id, variant_id, SKU and the stored product_name snapshot
 * are copied straight from the original sale line. Quantities are capped at
 * what is still returnable, and the database RPC `post_sales_return()` remains
 * the only thing that touches inventory, COGS and receivables.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency } from "@/lib/format";
import { nextDocNumber, postSalesReturn, round2, RETURN_CONDITIONS } from "@/lib/sales";
import { titleCase } from "@/lib/format";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReturnLine = {
  item: Row;
  returnable: number;
  quantity: number;
  condition: string;
};

export function ReturnDialog({
  sale,
  onOpenChange,
}: {
  sale: Row | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { businessId, currency, userId } = useBusiness();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sale?.id) {
      setLines([]);
      setReason("");
      return;
    }
    setLoading(true);
    void (async () => {
      const { data } = await db.from("sale_items").select("*").eq("sale_id", sale.id);
      if (cancelled) return;
      setLines(
        ((data ?? []) as Row[]).map((item) => {
          const returnable = round2(
            Number(item.quantity ?? 0) - Number(item.returned_quantity ?? 0),
          );
          return {
            item,
            returnable: Math.max(returnable, 0),
            quantity: 0,
            condition: "resellable",
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sale?.id]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      if (!(l.quantity > 0)) continue;
      const net = round2(l.quantity * Number(l.item.unit_price ?? 0));
      subtotal += net;
      tax += round2((net * Number(l.item.tax_rate ?? 0)) / 100);
    }
    subtotal = round2(subtotal);
    tax = round2(tax);
    return { subtotal, tax, total: round2(subtotal + tax) };
  }, [lines]);

  function setLine(index: number, patch: Partial<ReturnLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!sale) throw new Error("No sale selected");
      const picked = lines.filter((l) => Number(l.quantity) > 0);
      if (!picked.length) throw new Error("Enter a quantity for at least one item");
      for (const l of picked) {
        if (l.quantity > l.returnable + 0.0001)
          throw new Error(
            `${l.item.product_name ?? "Item"}: only ${l.returnable} left to return`,
          );
      }
      if (!reason.trim()) throw new Error("A return reason is required");

      const number = await nextDocNumber(businessId!, "RET");
      const { data: ret, error } = await db
        .from("sales")
        .insert({
          business_id: businessId,
          document_type: "return",
          sale_type: "return",
          sale_number: number,
          original_sale_id: sale.id,
          customer_id: sale.customer_id ?? null,
          location_id: sale.location_id ?? null,
          currency: sale.currency ?? null,
          tax_inclusive: !!sale.tax_inclusive,
          status: "draft",
          payment_method: sale.payment_method ?? "cash",
          payment_status: "unpaid",
          sale_date: sale.sale_date,
          subtotal: totals.subtotal,
          discount: 0,
          tax: totals.tax,
          shipping: 0,
          other_charges: 0,
          total: totals.total,
          paid: 0,
          cost_total: 0,
          return_reason: reason.trim(),
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from("sale_items").insert(
        picked.map((l) => ({
          business_id: businessId,
          sale_id: ret.id,
          // Exact sellable identity carried over from the original line.
          product_id: l.item.product_id,
          variant_id: l.item.variant_id ?? null,
          product_name: l.item.product_name,
          sku: l.item.sku ?? null,
          unit: l.item.unit ?? null,
          quantity: l.quantity,
          unit_price: l.item.unit_price,
          unit_cost: l.item.unit_cost ?? 0,
          discount: 0,
          tax_rate: l.item.tax_rate ?? 0,
          tax: round2((l.quantity * Number(l.item.unit_price ?? 0) * Number(l.item.tax_rate ?? 0)) / 100),
          total: round2(
            l.quantity *
              Number(l.item.unit_price ?? 0) *
              (1 + Number(l.item.tax_rate ?? 0) / 100),
          ),
          condition: l.condition,
        })),
      );
      if (itemsError) {
        await db.from("sales").delete().eq("id", ret.id);
        throw itemsError;
      }

      await postSalesReturn(ret.id);
      return ret;
    },
    onSuccess: () => {
      toast.success("Return posted — stock, cost and receivables updated");
      queryClient.invalidateQueries({ queryKey: ["sales", businessId] });
      queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
      queryClient.invalidateQueries({ queryKey: ["reports", businessId] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not post the return"),
  });

  return (
    <Dialog open={!!sale} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Return items from {sale?.sale_number}</DialogTitle>
          <DialogDescription>
            Choose what is coming back. Stock, cost of goods and the customer balance are
            updated automatically for the exact item or variant that was sold.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading the original items…</p>
        ) : lines.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">This sale has no items.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Returnable</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                  <TableHead className="w-40">Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.item.id}>
                    <TableCell className="font-medium">{l.item.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.item.sku ?? "—"}</TableCell>
                    <TableCell className="text-right">{l.returnable}</TableCell>
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
                    <TableCell>
                      <Select
                        value={l.condition}
                        onValueChange={(v) => setLine(i, { condition: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RETURN_CONDITIONS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {titleCase(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="return-reason">Reason</Label>
          <Textarea
            id="return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are these items coming back?"
          />
        </div>

        <div className="flex justify-end gap-6 text-sm">
          <span className="text-muted-foreground">Tax {formatCurrency(totals.tax, currency)}</span>
          <span className="font-semibold">
            Refund total {formatCurrency(totals.total, currency)}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || totals.total <= 0 || !reason.trim()}
          >
            {submit.isPending ? "Posting…" : "Post return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
