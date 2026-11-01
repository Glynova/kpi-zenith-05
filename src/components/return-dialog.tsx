/**
 * Sales return dialog.
 *
 * Returns are created from the original sale so the exact sellable identity is
 * preserved: product_id, variant_id, SKU and the stored product_name snapshot
 * are copied straight from the original sale line. When batch or serial
 * tracking is switched on, the exact batch and serial numbers coming back are
 * recorded on the return line too, and the database RPC `post_sales_return()`
 * validates that identity and remains the only thing that touches inventory,
 * batch balances, serial lifecycle, COGS and receivables.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency } from "@/lib/format";
import {
  createSale,
  orderTotals,
  postSalesReturn,
  round2,
  RETURN_CONDITIONS,
  type CartLine,
} from "@/lib/sales";
import { titleCase } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  batchId: string;
  serialIds: string[];
  trackBatch: boolean;
  trackSerial: boolean;
};

const sameIdentity = (a: Row, productId: unknown, variantId: unknown) =>
  String(a.product_id) === String(productId) &&
  String(a.variant_id ?? "") === String(variantId ?? "");

function toReturnCartLine(line: ReturnLine): CartLine {
  const originalQuantity = Number(line.item.quantity ?? 0);
  const returnedDiscount =
    originalQuantity > 0
      ? round2((Number(line.item.discount ?? 0) * line.quantity) / originalQuantity)
      : 0;
  return {
    key: String(line.item.id),
    product_id: String(line.item.product_id),
    variant_id: line.item.variant_id == null ? null : String(line.item.variant_id),
    product_name: String(line.item.product_name ?? ""),
    quantity: line.quantity,
    unit_price: Number(line.item.unit_price ?? 0),
    unit_cost: Number(line.item.unit_cost ?? 0),
    discount: returnedDiscount,
    discount_type: "amount",
    tax_rate: Number(line.item.tax_rate ?? 0),
  };
}

export function ReturnDialog({
  sale,
  onOpenChange,
}: {
  sale: Row | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { businessId, currency, userId, feature } = useBusiness();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [serials, setSerials] = useState<Row[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const batchOn = feature("track_batch");
  const serialOn = feature("track_serial");

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
      const items = (data ?? []) as Row[];
      const productIds = Array.from(new Set(items.map((i) => String(i.product_id))));

      const [products, batchRows, serialRows] = await Promise.all([
        productIds.length
          ? db.from("products").select("id,track_batch,track_serial").in("id", productIds)
          : Promise.resolve({ data: [] as Row[] }),
        productIds.length
          ? db
              .from("batches")
              .select("id,batch_number,lot_number,expiry_date,product_id,variant_id,warehouse_id")
              .eq("business_id", businessId)
              .in("product_id", productIds)
          : Promise.resolve({ data: [] as Row[] }),
        productIds.length
          ? db
              .from("serial_numbers")
              .select("id,serial_number,status,product_id,variant_id")
              .eq("business_id", businessId)
              .in("product_id", productIds)
          : Promise.resolve({ data: [] as Row[] }),
      ]);
      if (cancelled) return;

      const productById = new Map(
        ((products.data ?? []) as Row[]).map((p) => [String(p.id), p] as const),
      );
      setBatches((batchRows.data ?? []) as Row[]);
      setSerials(
        ((serialRows.data ?? []) as Row[]).filter((s) =>
          ["sold", "reserved", "in_stock"].includes(String(s.status ?? "")),
        ),
      );
      setLines(
        items.map((item) => {
          const returnable = round2(
            Number(item.quantity ?? 0) - Number(item.returned_quantity ?? 0),
          );
          const product = productById.get(String(item.product_id));
          return {
            item,
            returnable: Math.max(returnable, 0),
            quantity: 0,
            condition: "resellable",
            batchId: "",
            serialIds: [],
            trackBatch: !!product?.track_batch,
            trackSerial: !!product?.track_serial,
          };
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sale?.id, businessId]);

  const returnCartLines = useMemo(
    () => lines.filter((line) => line.quantity > 0).map(toReturnCartLine),
    [lines],
  );
  const returnDiscount = useMemo(() => {
    if (!sale) return { amount: 0, type: "amount" as const };

    const originalTotals = orderTotals(
      lines.map((line) => toReturnCartLine({ ...line, quantity: Number(line.item.quantity ?? 0) })),
      { taxInclusive: !!sale.tax_inclusive },
    );
    const returnedTotals = orderTotals(returnCartLines, {
      taxInclusive: !!sale.tax_inclusive,
    });
    const originalAfterItemDiscount = Math.max(originalTotals.subtotal, 0);
    const returnedAfterItemDiscount = Math.max(returnedTotals.subtotal, 0);
    const originalOrderDiscount = Math.max(
      round2(Number(sale.discount ?? 0) - originalTotals.itemDiscount),
      0,
    );

    if (sale.discount_type === "percent") {
      return { amount: Number(sale.discount_value ?? 0), type: "percent" as const };
    }
    return {
      amount:
        originalAfterItemDiscount > 0
          ? round2((originalOrderDiscount * returnedAfterItemDiscount) / originalAfterItemDiscount)
          : 0,
      type: "amount" as const,
    };
  }, [lines, returnCartLines, sale]);
  const totals = useMemo(
    () =>
      orderTotals(returnCartLines, {
        taxInclusive: !!sale?.tax_inclusive,
        orderDiscount: returnDiscount.amount,
        orderDiscountType: returnDiscount.type,
      }),
    [returnCartLines, returnDiscount, sale?.tax_inclusive],
  );

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
          throw new Error(`${l.item.product_name ?? "Item"}: only ${l.returnable} left to return`);
        if (batchOn && l.trackBatch && !l.batchId)
          throw new Error(`${l.item.product_name ?? "Item"}: choose the batch coming back`);
        if (serialOn && l.trackSerial && l.serialIds.length !== l.quantity)
          throw new Error(
            `${l.item.product_name ?? "Item"}: pick exactly ${l.quantity} serial number(s)`,
          );
      }
      if (!reason.trim()) throw new Error("A return reason is required");

      const ret = await createSale({
        businessId: businessId!,
        documentType: "return",
        customerId: sale.customer_id ?? null,
        locationId: sale.location_id ?? null,
        currency: sale.currency ?? undefined,
        taxInclusive: !!sale.tax_inclusive,
        saleDate: sale.sale_date,
        paymentMethod: sale.payment_method ?? "cash",
        status: "draft",
        orderDiscount: returnDiscount.amount,
        orderDiscountType: returnDiscount.type,
        originalSaleId: sale.id,
        returnReason: reason.trim(),
        createdBy: userId,
        payments: [],
        lines: picked.map((line) => ({
          ...toReturnCartLine(line),
          sku: line.item.sku ?? null,
          unit: line.item.unit ?? null,
          batch_id: line.batchId || null,
          serial_ids: line.serialIds.length ? line.serialIds : null,
          condition: line.condition,
        })),
      });

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
            Choose what is coming back. Stock, cost of goods and the customer balance are updated
            automatically for the exact item or variant that was sold.
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
                {lines.map((l, i) => {
                  const lineBatches = batches.filter((b) =>
                    sameIdentity(b, l.item.product_id, l.item.variant_id),
                  );
                  const lineSerials = serials.filter((s) =>
                    sameIdentity(s, l.item.product_id, l.item.variant_id),
                  );
                  const showBatch = batchOn && l.trackBatch;
                  const showSerial = serialOn && l.trackSerial;
                  return (
                    <Fragment key={String(l.item.id)}>
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
                      {(showBatch || showSerial) && l.quantity > 0 ? (
                        <TableRow key={`${l.item.id}-identity`} className="bg-muted/30">
                          <TableCell colSpan={5} className="space-y-3">
                            {showBatch ? (
                              <div className="space-y-1">
                                <Label className="text-xs">Batch coming back</Label>
                                <Select
                                  value={l.batchId}
                                  onValueChange={(v) => setLine(i, { batchId: v })}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose the batch" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lineBatches.map((b) => (
                                      <SelectItem key={String(b.id)} value={String(b.id)}>
                                        {String(b.batch_number ?? b.lot_number ?? "Batch")}
                                        {b.expiry_date ? ` — expires ${b.expiry_date}` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {lineBatches.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    No batches recorded for this item yet.
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {showSerial ? (
                              <div className="space-y-1">
                                <Label className="text-xs">
                                  Serial numbers ({l.serialIds.length}/{l.quantity})
                                </Label>
                                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                                  {lineSerials.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                      No serial numbers recorded for this item yet.
                                    </p>
                                  ) : (
                                    lineSerials.map((s) => {
                                      const id = String(s.id);
                                      const checked = l.serialIds.includes(id);
                                      return (
                                        <label
                                          key={id}
                                          className="flex items-center gap-2 text-sm"
                                          htmlFor={`serial-${id}`}
                                        >
                                          <Checkbox
                                            id={`serial-${id}`}
                                            checked={checked}
                                            onCheckedChange={(v) =>
                                              setLine(i, {
                                                serialIds: v
                                                  ? [...l.serialIds, id]
                                                  : l.serialIds.filter((x) => x !== id),
                                              })
                                            }
                                          />
                                          {String(s.serial_number)}
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
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
