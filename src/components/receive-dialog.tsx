/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Goods receiving.
 *
 * Creates a draft goods receipt and confirms it through the database function
 * confirm_goods_receipt, which is the ONLY path that writes stock movements,
 * costing layers, price history and the supplier payable.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber, todayISO } from "@/lib/format";
import { expiryState, nextDocNumber, round2 } from "@/lib/purchasing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Line = {
  id: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  unit: string | null;
  unit_cost: number;
  ordered: number;
  previously: number;
  remaining: number;
  receive: number;
  damaged: number;
  rejected: number;
  batch_number: string;
  manufactured_date: string;
  expiry_date: string;
  serials: string;
  track_serial: boolean;
};

export function ReceiveDialog({
  order,
  open,
  onClose,
  trackBatch,
  trackExpiry,
  trackSerial,
}: {
  order: Row;
  open: boolean;
  onClose: () => void;
  trackBatch: boolean;
  trackExpiry: boolean;
  trackSerial: boolean;
}) {
  const { businessId, currency, userId, settings } = useBusiness();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [receiptDate, setReceiptDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState("");

  const { data: poItems = [], isLoading } = useQuery({
    queryKey: ["receive-items", order.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_order_items")
        .select("*, products(id,name,track_serial)")
        .eq("purchase_order_id", order.id);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    setLines(
      poItems.map((i) => {
        const ordered = Number(i.quantity ?? 0);
        const previously = Number(i.received_quantity ?? 0);
        const remaining = Math.max(
          0,
          ordered - previously - Number(i.damaged_quantity ?? 0) - Number(i.rejected_quantity ?? 0),
        );
        return {
          id: i.id,
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          name: i.products?.name ?? "Item",
          unit: i.unit ?? null,
          unit_cost: Number(i.unit_cost ?? 0),
          ordered,
          previously,
          remaining,
          receive: remaining,
          damaged: 0,
          rejected: 0,
          batch_number: "",
          manufactured_date: "",
          expiry_date: "",
          serials: "",
          track_serial: trackSerial && !!i.products?.track_serial,
        };
      }),
    );
  }, [poItems, trackSerial]);

  function update(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  const accepted = (l: Line) => Math.max(0, l.receive - l.damaged - l.rejected);
  const totalValue = useMemo(
    () => round2(lines.reduce((s, l) => s + Math.max(0, l.receive - l.damaged - l.rejected) * l.unit_cost, 0)),
    [lines],
  );

  const submit = useMutation({
    mutationFn: async () => {
      const active = lines.filter((l) => l.receive > 0);
      if (!active.length) throw new Error("Enter at least one received quantity");

      for (const l of active) {
        if (l.receive > l.remaining) {
          throw new Error(`${l.name}: cannot receive more than the remaining ${l.remaining}`);
        }
        if (l.damaged + l.rejected > l.receive) {
          throw new Error(`${l.name}: damaged plus rejected cannot exceed the received quantity`);
        }
        if (trackExpiry && l.expiry_date && l.expiry_date < receiptDate) {
          throw new Error(`${l.name}: expiry date cannot be before the receiving date`);
        }
        if (l.track_serial) {
          const serials = l.serials.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
          if (serials.length !== accepted(l)) {
            throw new Error(
              `${l.name}: enter ${accepted(l)} serial numbers (currently ${serials.length})`,
            );
          }
          if (new Set(serials).size !== serials.length) {
            throw new Error(`${l.name}: serial numbers must be unique`);
          }
        }
      }

      const receiptNumber = await nextDocNumber(businessId!, "GR");
      const { data: gr, error } = await db
        .from("goods_receipts")
        .insert({
          business_id: businessId,
          receipt_number: receiptNumber,
          purchase_order_id: order.id,
          supplier_id: order.supplier_id,
          warehouse_id: order.warehouse_id,
          receipt_date: receiptDate,
          received_by: userId,
          reference: order.po_number,
          attachment_url: attachment || null,
          notes: notes || null,
          status: "draft",
          created_by: userId,
        })
        .select("id, receipt_number")
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from("goods_receipt_items").insert(
        active.map((l) => ({
          business_id: businessId,
          receipt_id: gr.id,
          purchase_order_item_id: l.id,
          product_id: l.product_id,
          variant_id: l.variant_id,
          ordered_quantity: l.ordered,
          received_quantity: l.receive,
          damaged_quantity: l.damaged,
          rejected_quantity: l.rejected,
          accepted_quantity: accepted(l),
          unit: l.unit,
          unit_cost: l.unit_cost,
          batch_number: trackBatch && l.batch_number ? l.batch_number : null,
          manufactured_date: l.manufactured_date || null,
          expiry_date: trackExpiry && l.expiry_date ? l.expiry_date : null,
          serial_numbers: l.track_serial
            ? l.serials.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
            : null,
        })),
      );
      if (itemsError) throw itemsError;

      const { error: confirmError } = await db.rpc("confirm_goods_receipt", { _receipt_id: gr.id });
      if (confirmError) throw confirmError;

      const serialRows = active
        .filter((l) => l.track_serial)
        .flatMap((l) =>
          l.serials
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((serial) => ({
              business_id: businessId,
              product_id: l.product_id,
              variant_id: l.variant_id,
              warehouse_id: order.warehouse_id,
              supplier_id: order.supplier_id,
              serial_number: serial,
              purchase_date: receiptDate,
              status: "in_stock",
              notes: `Received on ${gr.receipt_number}`,
            })),
        );
      if (serialRows.length) {
        const { error: serialError } = await db.from("serial_numbers").insert(serialRows);
        if (serialError) throw new Error(`Serial numbers rejected: ${serialError.message}`);
      }

      return gr.receipt_number as string;
    },
    onSuccess: (number) => {
      toast.success(`Goods receipt ${number} confirmed — stock and payables updated`);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      queryClient.invalidateQueries({ queryKey: ["po-progress", businessId] });
      queryClient.invalidateQueries({ queryKey: ["goods-receipts", businessId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not receive the goods"),
  });

  const warnDays = Number((settings as any)?.expiry_alert_days ?? 30);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receive goods · {order.po_number}</DialogTitle>
          <DialogDescription>
            Enter what actually arrived. Only the accepted quantity is added to stock, and the
            order stays partially received until everything is resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs">Receiving date</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block text-xs">Attachment link (invoice, DR, photo)</Label>
            <Input
              placeholder="https://..."
              value={attachment}
              onChange={(e) => setAttachment(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading order lines...</p>
        ) : (
          <div className="space-y-3">
            {lines.map((l) => {
              const exp = trackExpiry ? expiryState(l.expiry_date || null, warnDays) : null;
              return (
                <div key={l.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Ordered {formatNumber(l.ordered, 0)} · Received {formatNumber(l.previously, 0)} ·
                      Remaining {formatNumber(l.remaining, 0)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">Receive now</Label>
                      <Input
                        type="number"
                        step="any"
                        value={l.receive}
                        onChange={(e) => update(l.id, { receive: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">Damaged</Label>
                      <Input
                        type="number"
                        step="any"
                        value={l.damaged}
                        onChange={(e) => update(l.id, { damaged: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">Rejected</Label>
                      <Input
                        type="number"
                        step="any"
                        value={l.rejected}
                        onChange={(e) => update(l.id, { rejected: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">Unit cost</Label>
                      <Input
                        type="number"
                        step="any"
                        value={l.unit_cost}
                        onChange={(e) => update(l.id, { unit_cost: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-end">
                      <Badge variant="secondary" className="w-full justify-center">
                        Accepted {formatNumber(accepted(l), 0)}
                      </Badge>
                    </div>
                  </div>

                  {(trackBatch || trackExpiry) && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {trackBatch && (
                        <div>
                          <Label className="mb-1 block text-[11px] text-muted-foreground">Batch number</Label>
                          <Input
                            value={l.batch_number}
                            onChange={(e) => update(l.id, { batch_number: e.target.value })}
                          />
                        </div>
                      )}
                      {trackBatch && (
                        <div>
                          <Label className="mb-1 block text-[11px] text-muted-foreground">Manufactured</Label>
                          <Input
                            type="date"
                            value={l.manufactured_date}
                            onChange={(e) => update(l.id, { manufactured_date: e.target.value })}
                          />
                        </div>
                      )}
                      {trackExpiry && (
                        <div>
                          <Label className="mb-1 block text-[11px] text-muted-foreground">Expiry</Label>
                          <Input
                            type="date"
                            value={l.expiry_date}
                            onChange={(e) => update(l.id, { expiry_date: e.target.value })}
                          />
                          {exp && (
                            <p
                              className={
                                exp.tone === "valid"
                                  ? "mt-1 text-[11px] text-muted-foreground"
                                  : "mt-1 text-[11px] font-medium text-destructive"
                              }
                            >
                              {exp.label}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {l.track_serial && (
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">
                        Serial numbers ({accepted(l)} required, one per line)
                      </Label>
                      <Textarea
                        rows={3}
                        value={l.serials}
                        onChange={(e) => update(l.id, { serials: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div>
          <Label className="mb-1.5 block text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="ml-auto text-sm font-semibold">
          Stock value received: {formatCurrency(totalValue, order.currency ?? currency)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Receiving..." : "Confirm receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
