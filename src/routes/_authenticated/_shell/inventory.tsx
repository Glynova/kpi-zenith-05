/* eslint-disable @typescript-eslint/no-explicit-any */
import { csvCell } from "@/lib/csv";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Scale, Search } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import { ADJUSTMENT_REASONS, MOVEMENT_GROUPS, movementSign } from "@/lib/inventory";
import { PageHeader, EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  "The stock movement ledger — every receipt, issue, transfer, adjustment and count, with cost and reference.";

function movementBadgeClass(type: string) {
  if (type === "opening_balance") return "border-primary/30 bg-primary/10 text-primary";
  if (["purchase", "return_in", "production_in"].includes(type))
    return "border-success/30 bg-success/10 text-success";
  if (["sale", "return_out"].includes(type))
    return "border-border bg-muted-surface text-muted-foreground";
  if (["consumption", "production_out", "waste", "damage"].includes(type))
    return "border-destructive/30 bg-destructive/10 text-destructive";
  if (type.startsWith("transfer_"))
    return "border-accent-violet/30 bg-accent-violet/10 text-accent-violet";
  if (type.startsWith("adjustment_")) return "border-warning/30 bg-warning/10 text-warning";
  if (type === "stock_count") return "border-cyan/30 bg-cyan/10 text-cyan";
  return "border-border bg-muted-surface text-muted-foreground";
}

function StockMovements() {
  const { businessId, currency, canWrite, feature, settings } = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [dialog, setDialog] = useState<null | "movement" | "adjustment">(null);
  const [form, setForm] = useState<Row>({});

  const { data, isLoading } = useQuery({
    queryKey: ["stock-movements", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [movements, products, warehouses, balances] = await Promise.all([
        db
          .from("inventory_movements")
          .select("*")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(400),
        db
          .from("products")
          .select("id, name, sku, unit, average_cost, cost_price")
          .eq("business_id", businessId),
        db.from("warehouses").select("id, name").eq("business_id", businessId),
        db.from("inventory_balances").select("*").eq("business_id", businessId),
      ]);
      if (movements.error) throw movements.error;
      return {
        movements: (movements.data ?? []) as Row[],
        products: (products.data ?? []) as Row[],
        warehouses: (warehouses.data ?? []) as Row[],
        balances: (balances.data ?? []) as Row[],
      };
    },
  });

  const productMap = useMemo(
    () => Object.fromEntries((data?.products ?? []).map((p) => [p.id, p])),
    [data],
  );
  const warehouseMap = useMemo(
    () => Object.fromEntries((data?.warehouses ?? []).map((w) => [w.id, w])),
    [data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.movements ?? []).filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (locationFilter !== "all" && (m.warehouse_id ?? "none") !== locationFilter) return false;
      if (!q) return true;
      const product = productMap[m.product_id];
      return [product?.name, product?.sku, m.reference, m.notes, m.batch_number, m.reason].some(
        (v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
      );
    });
  }, [data, search, typeFilter, locationFilter, productMap]);

  const totals = useMemo(() => {
    const units = (data?.balances ?? []).reduce((a, b) => a + Number(b.quantity ?? 0), 0);
    const value = (data?.balances ?? []).reduce(
      (a, b) => a + Number(b.quantity ?? 0) * Number(b.average_cost ?? 0),
      0,
    );
    return { units, value };
  }, [data]);

  const todayActivity = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const movements = (data?.movements ?? []).filter((movement) => {
      const created = new Date(movement.created_at);
      return created >= start && created < end;
    });
    const receivedTypes = ["purchase", "return_in", "production_in", "transfer_in"];
    const received = movements
      .filter((movement) => receivedTypes.includes(movement.type))
      .reduce((sum, movement) => sum + Number(movement.base_quantity ?? movement.quantity ?? 0), 0);
    const consumedTypes = ["sale", "consumption", "production_out", "waste", "damage"];
    const consumed = movements
      .filter((movement) => consumedTypes.includes(movement.type))
      .reduce((sum, movement) => sum + Number(movement.base_quantity ?? movement.quantity ?? 0), 0);
    const adjustments = movements.filter((movement) =>
      ["adjustment_in", "adjustment_out", "stock_count"].includes(movement.type),
    ).length;
    return { received, consumed, adjustments };
  }, [data]);

  const record = useMutation({
    mutationFn: async (values: Row) => {
      const quantity = Number(values.quantity ?? 0);
      if (!values.product_id) throw new Error("Choose a product");
      if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");
      const payload: Row = {
        business_id: businessId,
        product_id: values.product_id,
        warehouse_id: values.warehouse_id || null,
        type: values.type,
        quantity,
        base_quantity: quantity,
        unit_cost: Number(values.unit_cost ?? 0) || 0,
        total_cost: quantity * (Number(values.unit_cost ?? 0) || 0),
        reason: values.reason || null,
        reference: values.reference || null,
        reference_type: values.reference ? "manual" : null,
        notes: values.notes || null,
      };
      const { error } = await db.from("inventory_movements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock movement recorded");
      queryClient.invalidateQueries({ queryKey: ["stock-movements", businessId] });
      queryClient.invalidateQueries({ queryKey: ["resource", "products", businessId] });
      setDialog(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not record the movement"),
  });

  function openMovement() {
    setForm({ type: "purchase", quantity: 1, unit_cost: 0 });
    setDialog("movement");
  }

  function openAdjustment() {
    setForm({ type: "adjustment_out", quantity: 1, reason: "Counting error" });
    setDialog("adjustment");
  }

  function exportCsv() {
    const header =
      "Date,Product,SKU,Location,Movement,Quantity,Unit cost,Total value,Reason,Reference";
    const body = rows
      .map((m) => {
        const p = productMap[m.product_id];
        const qty = movementSign(m.type) * Number(m.base_quantity ?? m.quantity ?? 0);
        return [
          formatDate(m.created_at),
          p?.name ?? "",
          p?.sku ?? "",
          warehouseMap[m.warehouse_id]?.name ?? "",
          m.type,
          qty,
          m.unit_cost ?? 0,
          Math.abs(qty) * Number(m.unit_cost ?? 0),
          m.reason ?? "",
          m.reference ?? "",
        ]
          .map((v) => csvCell(v))
          .join(",");
      })
      .join("\n");
    const url = URL.createObjectURL(new Blob([`${header}\n${body}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "stock-movements.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const isAdjustment = dialog === "adjustment";
  const selectedProduct = productMap[form.product_id];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Movements"
        description={description}
        actions={
          <>
            {canWrite && (
              <>
                <Button variant="outline" size="sm" onClick={openAdjustment}>
                  <Scale className="size-4" /> Adjust stock
                </Button>
                <Button size="sm" onClick={openMovement}>
                  <Plus className="size-4" /> Record movement
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Units on hand" value={formatNumber(totals.units, 2)} />
        <StatCard label="Inventory value" value={formatCurrency(totals.value, currency)} />
        <StatCard label="Costing method" value={titleCase(String(settings.costing_method))} />
        <StatCard
          label="Received today"
          value={formatNumber(todayActivity.received, 2)}
          tone={todayActivity.received > 0 ? "success" : "default"}
        />
        <StatCard
          label="Consumed today"
          value={formatNumber(todayActivity.consumed, 2)}
          tone={todayActivity.consumed > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="Adjustments"
          value={formatNumber(todayActivity.adjustments, 0)}
          tone={todayActivity.adjustments > 0 ? "warning" : "default"}
        />
      </div>

      <div className="page-toolbar">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product, SKU, batch or reference..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All movements" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All movements</SelectItem>
            {MOVEMENT_GROUPS.flatMap((g) => g.types).map((t) => (
              <SelectItem key={t} value={t}>
                {titleCase(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {feature("track_locations") && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {(data?.warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={!rows.length}
          className="sm:ml-auto"
        >
          <Download /> Export
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No stock movements yet"
          description="Receive a purchase order, record a sale or post an opening balance to start the ledger."
          action={canWrite ? <Button onClick={openMovement}>Record movement</Button> : undefined}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Total value</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => {
                const product = productMap[m.product_id];
                const sign = movementSign(m.type);
                const qty = Number(m.base_quantity ?? m.quantity ?? 0);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(m.created_at)}</TableCell>
                    <TableCell className="min-w-56">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="table-image-avatar grid size-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white text-lg font-semibold text-slate-900">
                          {String(product?.name ?? "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          {product ? (
                            <Link
                              to="/products/$productId"
                              params={{ productId: product.id }}
                              className="block truncate font-semibold hover:text-primary"
                            >
                              {product.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <span className="block truncate text-sm text-muted-foreground">
                            {product?.sku ?? "No SKU"}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {warehouseMap[m.warehouse_id]?.name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className={movementBadgeClass(m.type)}>
                        {titleCase(m.type)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right font-medium ${sign < 0 ? "text-destructive" : sign > 0 ? "text-success" : "text-foreground"}`}
                    >
                      {sign < 0 ? "−" : sign > 0 ? "+" : ""}
                      {formatNumber(qty, 2)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatCurrency(Number(m.unit_cost ?? 0), currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatCurrency(
                        Number(m.total_cost ?? qty * Number(m.unit_cost ?? 0)),
                        currency,
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {m.reason ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {m.reference ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isAdjustment ? "Adjust stock" : "Record stock movement"}</DialogTitle>
            <DialogDescription>
              {isAdjustment
                ? "Adjustments never overwrite stock — they post a traceable transaction with a reason."
                : "Every movement is written to the ledger and updates balances and cost automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <Label className="mb-1.5 block text-xs">Product</Label>
              <Select
                value={form.product_id ?? undefined}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    product_id: v,
                    unit_cost: Number(
                      productMap[v]?.average_cost || productMap[v]?.cost_price || 0,
                    ),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {(data?.products ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">
                {isAdjustment ? "Direction" : "Movement type"}
              </Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isAdjustment ? (
                    <>
                      <SelectItem value="adjustment_in">Increase stock</SelectItem>
                      <SelectItem value="adjustment_out">Decrease stock</SelectItem>
                    </>
                  ) : (
                    MOVEMENT_GROUPS.map((g) => (
                      <div key={g.label}>
                        {g.types.map((t) => (
                          <SelectItem key={t} value={t}>
                            {titleCase(t)}
                          </SelectItem>
                        ))}
                      </div>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">
                Quantity {selectedProduct?.unit ? `(${selectedProduct.unit})` : ""}
              </Label>
              <Input
                type="number"
                min="0"
                value={form.quantity ?? ""}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>

            {feature("track_locations") && (
              <div className="min-w-0">
                <Label className="mb-1.5 block text-xs">Location</Label>
                <Select
                  value={form.warehouse_id ?? undefined}
                  onValueChange={(v) => setForm({ ...form, warehouse_id: v })}
                >
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

            {feature("track_cost") && (
              <div className="min-w-0">
                <Label className="mb-1.5 block text-xs">Unit cost</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.unit_cost ?? ""}
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                />
              </div>
            )}

            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Reason</Label>
              <Select
                value={form.reason ?? undefined}
                onValueChange={(v) => setForm({ ...form, reason: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Reference</Label>
              <Input
                value={form.reference ?? ""}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="PO-001, SALE-004..."
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="mb-1.5 block text-xs">Notes</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => record.mutate(form)} disabled={record.isPending}>
              {record.isPending
                ? "Saving..."
                : isAdjustment
                  ? "Post adjustment"
                  : "Record movement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/inventory")({
  head: () => ({
    meta: [
      { title: "Stock Movements — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Stock Movements — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockMovements,
});
