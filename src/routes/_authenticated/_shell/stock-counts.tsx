/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const description =
  "Physical counts per location. Enter what you counted, review the variance, then confirm — adjustments post to the ledger.";

const COUNT_REASONS = ["Counting error", "Damaged", "Expired", "Lost / theft", "Not recorded sale", "Not recorded delivery", "Other"];

type CountLine = {
  product_id: string;
  name: string;
  sku: string | null;
  expected: number;
  counted: string;
  reason?: string;
};

function StockCounts() {
  const { businessId, canWrite, feature } = useBusiness();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [lines, setLines] = useState<CountLine[]>([]);
  const [notes, setNotes] = useState("");
  const [blind, setBlind] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stock-counts", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [counts, items, products, warehouses, balances] = await Promise.all([
        db
          .from("stock_counts")
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(100),
        db.from("stock_count_items").select("*").eq("business_id", businessId),
        db.from("products").select("id, name, sku, stock, status").eq("business_id", businessId),
        db.from("warehouses").select("id, name").eq("business_id", businessId),
        db.from("inventory_balances").select("*").eq("business_id", businessId),
      ]);
      if (counts.error) throw counts.error;
      return {
        counts: (counts.data ?? []) as Row[],
        items: (items.data ?? []) as Row[],
        products: (products.data ?? []) as Row[],
        warehouses: (warehouses.data ?? []) as Row[],
        balances: (balances.data ?? []) as Row[],
      };
    },
  });

  const warehouseMap = useMemo(
    () => Object.fromEntries((data?.warehouses ?? []).map((w) => [w.id, w])),
    [data],
  );

  function expectedFor(productId: string, locationId: string) {
    if (!feature("track_locations") || !locationId) {
      const p = (data?.products ?? []).find((x) => x.id === productId);
      return Number(p?.stock ?? 0);
    }
    const balance = (data?.balances ?? []).find(
      (b) => b.product_id === productId && b.warehouse_id === locationId && !b.variant_id,
    );
    return Number(balance?.quantity ?? 0);
  }

  function startCount() {
    const location = feature("track_locations") ? warehouseId : "";
    const next = (data?.products ?? [])
      .filter((p) => p.status !== "inactive")
      .map((p) => ({
        product_id: p.id,
        name: p.name,
        sku: p.sku ?? null,
        expected: expectedFor(p.id, location),
        counted: "",
      }));
    setLines(next);
    setOpen(true);
  }

  const confirm = useMutation({
    mutationFn: async () => {
      const counted = lines.filter((l) => l.counted !== "" && !Number.isNaN(Number(l.counted)));
      if (!counted.length) throw new Error("Enter at least one physical count");
      if (blind) {
        setBlind(false);
        throw new Error("Counts entered. Now review differences and choose reasons.");
      }
      const missing = counted.find((l) => Number(l.counted) !== l.expected && !l.reason);
      if (missing) throw new Error(`Choose a reason for the difference on ${missing.name}`);

      const { data: count, error } = await db
        .from("stock_counts")
        .insert({
          business_id: businessId,
          warehouse_id: feature("track_locations") ? warehouseId || null : null,
          reference: `COUNT-${new Date().toISOString().slice(0, 10)}`,
          status: "confirmed",
          notes: notes || null,
          confirmed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      const itemsPayload = counted.map((l) => ({
        business_id: businessId,
        stock_count_id: count.id,
        product_id: l.product_id,
        expected_quantity: l.expected,
        counted_quantity: Number(l.counted),
      }));
      const { error: itemError } = await db.from("stock_count_items").insert(itemsPayload);
      if (itemError) throw itemError;

      const movements = counted
        .map((l) => {
          const variance = Number(l.counted) - l.expected;
          if (variance === 0) return null;
          return {
            business_id: businessId,
            product_id: l.product_id,
            warehouse_id: feature("track_locations") ? warehouseId || null : null,
            type: variance > 0 ? "adjustment_in" : "adjustment_out",
            quantity: Math.abs(variance),
            base_quantity: Math.abs(variance),
            reason: "Stock count",
            reference: count.reference,
            reference_type: "stock_count",
            reference_id: count.id,
            notes: `Expected ${l.expected}, counted ${l.counted}`,
          };
        })
        .filter(Boolean);

      if (movements.length) {
        const { error: moveError } = await db.from("inventory_movements").insert(movements);
        if (moveError) throw moveError;
      }
      return movements.length;
    },
    onSuccess: (n) => {
      toast.success(`Count confirmed — ${n} adjustment${n === 1 ? "" : "s"} posted`);
      queryClient.invalidateQueries({ queryKey: ["stock-counts", businessId] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements", businessId] });
      setOpen(false);
      setLines([]);
      setNotes("");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not confirm the count"),
  });

  const varianceTotal = lines.reduce(
    (a, l) => a + (l.counted === "" ? 0 : Number(l.counted) - l.expected),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Counts"
        description={description}
        actions={
          canWrite ? (
            <Button size="sm" onClick={startCount}>
              <Plus className="size-4" /> Start stock count
            </Button>
          ) : undefined
        }
      />

      {feature("track_locations") && (
        <div className="max-w-xs">
          <Label className="mb-1.5 block text-xs">Location to count</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Select location..." />
            </SelectTrigger>
            <SelectContent>
              {(data?.warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (data?.counts.length ?? 0) === 0 ? (
        <EmptyState
          title="No stock counts yet"
          description="Start a count to compare expected stock against what is physically on the shelf."
          action={canWrite ? <Button onClick={startCount}>Start stock count</Button> : undefined}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Net variance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.counts ?? []).map((c) => {
                const items = (data?.items ?? []).filter((i) => i.stock_count_id === c.id);
                const variance = items.reduce(
                  (a, i) =>
                    a + (Number(i.counted_quantity ?? 0) - Number(i.expected_quantity ?? 0)),
                  0,
                );
                return (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(c.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.reference ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {warehouseMap[c.warehouse_id]?.name ?? "All locations"}
                    </TableCell>
                    <TableCell className="text-right">{items.length}</TableCell>
                    <TableCell className="text-right font-medium">
                      {variance > 0 ? "+" : ""}
                      {formatNumber(variance, 2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Physical stock count</DialogTitle>
            <DialogDescription>
              Enter the quantity you physically counted. Leave a row blank to skip it. Every
              difference needs a reason.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
            Blind count (hide expected quantities while counting)
          </label>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active products to count.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    {!blind && <TableHead className="text-right">Expected</TableHead>}
                    <TableHead className="w-32 text-right">Counted</TableHead>
                    {!blind && <TableHead className="text-right">Variance</TableHead>}
                    {!blind && <TableHead>Reason</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => {
                    const variance = l.counted === "" ? null : Number(l.counted) - l.expected;
                    return (
                      <TableRow key={l.product_id}>
                        <TableCell className="whitespace-nowrap">{l.name}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {l.sku ?? "—"}
                        </TableCell>
                        {!blind && (
                          <TableCell className="text-right">
                            {formatNumber(l.expected, 2)}
                          </TableCell>
                        )}
                        <TableCell>
                          <Input
                            type="number"
                            className="text-right"
                            value={l.counted}
                            onChange={(e) => {
                              const next = [...lines];
                              next[i] = { ...l, counted: e.target.value };
                              setLines(next);
                            }}
                          />
                        </TableCell>
                        {!blind && (
                          <TableCell
                            className={`text-right font-medium ${variance && variance < 0 ? "text-destructive" : ""}`}
                          >
                            {variance === null
                              ? "—"
                              : `${variance > 0 ? "+" : ""}${formatNumber(variance, 2)}`}
                          </TableCell>
                        )}
                        {!blind && (
                          <TableCell>
                            {variance ? (
                              <select
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value={l.reason ?? ""}
                                onChange={(e) => {
                                  const next = [...lines];
                                  next[i] = { ...l, reason: e.target.value };
                                  setLines(next);
                                }}
                              >
                                <option value="">Choose…</option>
                                {COUNT_REASONS.map((r) => (
                                  <option key={r}>{r}</option>
                                ))}
                              </select>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-xs">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <DialogFooter className="items-center gap-3 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Net variance: <span className="font-medium">{formatNumber(varianceTotal, 2)}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                <ClipboardCheck className="size-4" />
                {confirm.isPending ? "Confirming..." : "Confirm count"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/stock-counts")({
  head: () => ({
    meta: [
      { title: "Stock Counts — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Stock Counts — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockCounts,
});
