/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Goods receiving.
 *
 * Creates a draft goods receipt and confirms it through the database function
 * confirm_goods_receipt, which is the ONLY path that writes stock movements,
 * costing layers, price history and the supplier payable.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Line = {
  id: string;
  product_id: string;
  variant_id: string | null;
  name: string;
  variant_name: string | null;
  sku: string | null;
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
  condition: string;
  note: string;
};

const CONDITIONS = ["Good", "Damaged packaging", "Partially damaged", "Wrong item", "Expired"];

function LineLabel({ l }: { l: Line }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {l.name}
        {l.variant_name ? `, ${l.variant_name}` : ""}
      </p>
      {l.sku && <p className="truncate text-[11px] text-muted-foreground">SKU {l.sku}</p>}
    </div>
  );
}

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState(false);

  const { data: poItems = [], isLoading } = useQuery({
    queryKey: ["receive-items", order.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_order_items")
        .select("*, products(id,name,sku,track_serial), product_variants(id,name,sku)")
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
          variant_name: i.product_variants?.name ?? null,
          sku: i.product_variants?.sku ?? i.products?.sku ?? null,
          condition: "Good",
          note: "",
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
    () =>
      round2(
        lines.reduce(
          (s, l) => s + Math.max(0, l.receive - l.damaged - l.rejected) * l.unit_cost,
          0,
        ),
      ),
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
          const serials = l.serials
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean);
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
          condition: l.condition || null,
          notes: l.note || null,
          serial_numbers: l.track_serial
            ? l.serials
                .split(/[\n,]/)
                .map((s) => s.trim())
                .filter(Boolean)
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
      setReviewing(false);
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not receive the goods"),
  });

  const warnDays = Number((settings as any)?.expiry_alert_days ?? 30);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review delivery · {order.po_number}</DialogTitle>
          <DialogDescription>
            Enter what actually arrived. Only the accepted quantity is added to stock, and the order
            stays partially received until everything is resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5 block text-xs">Receiving date</Label>
            <Input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
            />
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
        ) : reviewing ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <p className="border-b border-border px-3 py-2 text-xs font-semibold">
              Delivery validation summary
            </p>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-[11px] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-right">Received</th>
                  <th className="px-2 py-2 text-right">Damaged</th>
                  <th className="px-2 py-2 text-right">Rejected</th>
                  <th className="px-2 py-2 text-right">Accepted</th>
                  <th className="px-3 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {lines
                  .filter((l) => l.receive > 0)
                  .map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 max-w-[220px] bg-background px-3 py-2">
                        <LineLabel l={l} />
                        {(l.condition !== "Good" || l.note) && (
                          <p className="text-[11px] text-muted-foreground">
                            {l.condition}
                            {l.note ? ` · ${l.note}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{formatNumber(l.receive, 0)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(l.damaged, 0)}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(l.rejected, 0)}</td>
                      <td className="px-2 py-2 text-right font-medium">
                        {formatNumber(accepted(l), 0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(
                          round2(accepted(l) * l.unit_cost),
                          order.currency ?? currency,
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-[11px] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Remaining</th>
                  <th className="px-2 py-2 text-left">Receive</th>
                  <th className="px-2 py-2 text-left">Damaged</th>
                  <th className="px-2 py-2 text-left">Rejected</th>
                  <th className="px-2 py-2 text-left">Unit cost</th>
                  <th className="px-3 py-2 text-right">Accepted</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const exp = trackExpiry ? expiryState(l.expiry_date || null, warnDays) : null;
                  const open = !!expanded[l.id];
                  return (
                    <Fragment key={l.id}>
                      <tr className="border-b border-border">
                        <td className="sticky left-0 z-10 max-w-[220px] bg-background px-2 py-2">
                          <button
                            type="button"
                            className="flex w-full items-start gap-1 text-left"
                            aria-expanded={open}
                            aria-label={`Details for ${l.name}${l.variant_name ? `, ${l.variant_name}` : ""}`}
                            onClick={() => setExpanded((p) => ({ ...p, [l.id]: !open }))}
                          >
                            {open ? (
                              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
                            )}
                            <LineLabel l={l} />
                          </button>
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground">
                          {formatNumber(l.remaining, 0)} of {formatNumber(l.ordered, 0)}
                        </td>
                        {(["receive", "damaged", "rejected", "unit_cost"] as const).map((k) => (
                          <td key={k} className="px-1 py-2">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              aria-label={`${k} ${l.variant_name ?? l.name}`}
                              className="h-8 w-20"
                              value={l[k]}
                              onChange={(e) => update(l.id, { [k]: Number(e.target.value) })}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right">
                          <Badge variant="secondary">{formatNumber(accepted(l), 0)}</Badge>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border bg-muted/30">
                          <td colSpan={7} className="px-3 py-3">
                            <div className="grid gap-2 sm:grid-cols-3">
                              <div>
                                <Label className="mb-1 block text-[11px] text-muted-foreground">
                                  Condition
                                </Label>
                                <Select
                                  value={l.condition}
                                  onValueChange={(v) => update(l.id, { condition: v })}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CONDITIONS.map((c) => (
                                      <SelectItem key={c} value={c}>
                                        {c}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="mb-1 block text-[11px] text-muted-foreground">
                                  Line note
                                </Label>
                                <Input
                                  className="h-8"
                                  value={l.note}
                                  onChange={(e) => update(l.id, { note: e.target.value })}
                                />
                              </div>
                              {trackBatch && (
                                <div>
                                  <Label className="mb-1 block text-[11px] text-muted-foreground">
                                    Batch number
                                  </Label>
                                  <Input
                                    className="h-8"
                                    value={l.batch_number}
                                    onChange={(e) => update(l.id, { batch_number: e.target.value })}
                                  />
                                </div>
                              )}
                              {trackBatch && (
                                <div>
                                  <Label className="mb-1 block text-[11px] text-muted-foreground">
                                    Manufactured
                                  </Label>
                                  <Input
                                    type="date"
                                    className="h-8"
                                    value={l.manufactured_date}
                                    onChange={(e) =>
                                      update(l.id, { manufactured_date: e.target.value })
                                    }
                                  />
                                </div>
                              )}
                              {trackExpiry && (
                                <div>
                                  <Label className="mb-1 block text-[11px] text-muted-foreground">
                                    Expiry
                                  </Label>
                                  <Input
                                    type="date"
                                    className="h-8"
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
                              {l.track_serial && (
                                <div className="sm:col-span-3">
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
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
          {reviewing ? (
            <Button variant="outline" onClick={() => setReviewing(false)}>
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          {reviewing ? (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? "Receiving..." : "Confirm receipt"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (!lines.some((l) => l.receive > 0)) {
                  toast.error("Enter at least one received quantity");
                  return;
                }
                setReviewing(true);
              }}
            >
              Review summary
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
