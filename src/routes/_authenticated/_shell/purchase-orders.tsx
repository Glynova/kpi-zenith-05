/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  PackageCheck,
  Printer,
  CheckCircle2,
  Send,
  AlertTriangle,
  Copy,
  Ban,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, formatNumber, titleCase, todayISO } from "@/lib/format";
import { canApprovePurchaseOrders } from "@/lib/permissions";
import {
  DEFAULT_PRICE_ALERT_PERCENT,
  LANDED_COST_METHODS,
  PAYMENT_TERMS,
  PO_STATUSES,
  PO_TRANSITIONS,
  RECEIVABLE_STATUSES,
  nextDocNumber,
  poLineTotal,
  priceVariance,
  round2,
} from "@/lib/purchasing";
import { printDocument } from "@/lib/print";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ReceiveDialog } from "@/components/receive-dialog";
import { SupplierReturnDialog } from "@/components/supplier-return-dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 25;

type PoLine = {
  key: string;
  product_id: string | null;
  variant_id: string | null;
  supplier_sku: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  discount: number;
  tax: number;
  last_price: number | null;
  moq: number;
  notes: string;
};

function emptyLine(): PoLine {
  return {
    key: Math.random().toString(36).slice(2),
    product_id: null,
    variant_id: null,
    supplier_sku: "",
    unit: "",
    quantity: 1,
    unit_cost: 0,
    discount: 0,
    tax: 0,
    last_price: null,
    moq: 0,
    notes: "",
  };
}

function PurchaseOrdersPage() {
  const { businessId, business, currency, canWrite, userId, role, feature } = useBusiness();
  const canApprove = canApprovePurchaseOrders(role);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [receiving, setReceiving] = useState<Row | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);
  const [items, setItems] = useState<PoLine[]>([emptyLine()]);
  const [form, setForm] = useState<Row>({});

  useEffect(() => setPage(0), [search, statusFilter]);

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", businessId, statusFilter, page, search],
    enabled: !!businessId,
    queryFn: async () => {
      let q = db
        .from("purchase_orders")
        .select("*, suppliers(name,email,phone,payment_terms), warehouses(name)", {
          count: "exact",
        })
        .eq("business_id", businessId);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) q = q.ilike("po_number", `%${search.trim()}%`);
      const { data, error, count } = await q
        .order("order_date", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const rows = ordersQuery.data?.rows ?? [];
  const total = ordersQuery.data?.count ?? 0;

  const { data: progress = {} } = useQuery({
    queryKey: ["po-progress", businessId, rows.map((r) => r.id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const { data } = await db
        .from("purchase_order_items")
        .select("purchase_order_id,quantity,received_quantity")
        .in(
          "purchase_order_id",
          rows.map((r) => r.id),
        );
      const out: Record<string, { ordered: number; received: number }> = {};
      for (const i of (data ?? []) as Row[]) {
        const bucket = (out[i.purchase_order_id] ??= { ordered: 0, received: 0 });
        bucket.ordered += Number(i.quantity ?? 0);
        bucket.received += Number(i.received_quantity ?? 0);
      }
      return out;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-lite", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id,name,cost_price,stock,unit,purchase_unit")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: productVariants = [] } = useQuery({
    queryKey: ["variants-lite", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("product_variants")
        .select("id,product_id,name,sku,cost_price,stock,status")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-lite", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("suppliers")
        .select("id,name,email,phone,payment_terms,currency,status")
        .eq("business_id", businessId)
        .neq("status", "blocked")
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["warehouses-lite", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("warehouses")
        .select("id,name,is_default")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["supplier-catalog", businessId, form.supplier_id],
    enabled: !!businessId && !!form.supplier_id,
    queryFn: async () => {
      const { data } = await db
        .from("supplier_products")
        .select("*, products(id,name,unit)")
        .eq("business_id", businessId)
        .eq("supplier_id", form.supplier_id)
        .eq("is_active", true);
      return (data ?? []) as Row[];
    },
  });

  const { data: viewItems = [] } = useQuery({
    queryKey: ["po-items", viewing?.id],
    enabled: !!viewing?.id,
    queryFn: async () => {
      const { data } = await db
        .from("purchase_order_items")
        .select("*, products(name)")
        .eq("purchase_order_id", viewing!.id);
      return (data ?? []) as Row[];
    },
  });

  const subtotal = round2(items.reduce((s, i) => s + poLineTotal(i), 0));
  const shipping = Number(form.shipping_cost ?? 0);
  const discount = Number(form.discount ?? 0);
  const other = Number(form.other_charges ?? 0);
  const taxRate = Number(form.tax_rate ?? business?.tax_rate ?? 0);
  const tax = round2((subtotal * taxRate) / 100);
  const grandTotal = round2(subtotal + tax + shipping + other - discount);

  /** Sorted product options: this supplier's catalog first. */
  const productOptions = useMemo(() => {
    const catalogIds = new Set(catalog.map((c) => c.product_id));
    const inCatalog = products.filter((p) => catalogIds.has(p.id));
    const rest = products.filter((p) => !catalogIds.has(p.id));
    return { inCatalog, rest };
  }, [products, catalog]);

  const variantsFor = (productId: string | null) =>
    productId
      ? productVariants.filter((v) => v.product_id === productId && v.status !== "archived")
      : [];

  function pickVariant(key: string, variantId: string) {
    const v = productVariants.find((x) => x.id === variantId);
    const cost = Number(v?.cost_price ?? 0);
    updateLine(
      key,
      cost > 0 ? { variant_id: variantId, unit_cost: cost } : { variant_id: variantId },
    );
  }

  function pickProduct(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    const sp = catalog.find((c) => c.product_id === productId);
    setItems((prev) =>
      prev.map((i) =>
        i.key === key
          ? {
              ...i,
              product_id: productId,
              variant_id: null,
              supplier_sku: sp?.supplier_sku ?? "",
              unit: sp?.purchase_unit ?? product?.purchase_unit ?? product?.unit ?? "",
              unit_cost: Number(sp?.unit_cost ?? product?.cost_price ?? 0),
              last_price: sp?.last_purchase_price != null ? Number(sp.last_purchase_price) : null,
              moq: Number(sp?.min_order_quantity ?? 0),
              quantity: Math.max(i.quantity, Number(sp?.min_order_quantity ?? 0) || i.quantity),
            }
          : i,
      ),
    );
  }

  function updateLine(key: string, patch: Partial<PoLine>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  const save = useMutation({
    mutationFn: async () => {
      const valid = items.filter((i) => i.product_id && i.quantity > 0);
      if (!valid.length) throw new Error("Add at least one line item");
      for (const i of valid) {
        if (variantsFor(i.product_id).length && !i.variant_id)
          throw new Error("Choose a variant");
      }
      if (!form.supplier_id) throw new Error("Choose a supplier");

      const poNumber = form.po_number || (await nextDocNumber(businessId!, "PO"));

      const { data: po, error } = await db
        .from("purchase_orders")
        .insert({
          business_id: businessId,
          supplier_id: form.supplier_id,
          warehouse_id: form.warehouse_id || null,
          po_number: poNumber,
          status: form.status ?? "draft",
          order_date: form.order_date ?? todayISO(),
          expected_date: form.expected_date || null,
          currency: form.currency || currency,
          exchange_rate: Number(form.exchange_rate ?? 1) || 1,
          payment_terms: form.payment_terms || null,
          landed_cost_method: form.landed_cost_method ?? "none",
          shipping_cost: shipping,
          discount,
          other_charges: other,
          subtotal,
          tax,
          total: grandTotal,
          paid: 0,
          notes: form.notes || null,
          created_by: userId,
        })
        .select("id, po_number")
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from("purchase_order_items").insert(
        valid.map((i) => ({
          business_id: businessId,
          purchase_order_id: po.id,
          product_id: i.product_id,
          variant_id: i.variant_id,
          supplier_sku: i.supplier_sku || null,
          unit: i.unit || null,
          quantity: i.quantity,
          received_quantity: 0,
          unit_cost: i.unit_cost,
          discount: i.discount,
          tax: i.tax,
          total: poLineTotal(i),
          expected_date: form.expected_date || null,
          notes: i.notes || null,
        })),
      );
      if (itemsError) throw itemsError;

      await db.rpc("log_audit_event", {
        _business_id: businessId,
        _action: "po_created",
        _module: "purchasing",
        _record_id: po.po_number,
        _new_value: { total: grandTotal, supplier_id: form.supplier_id },
      });
      return po;
    },
    onSuccess: () => {
      toast.success("Purchase order created — stock is unchanged until goods are received");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save the purchase order"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ po, status }: { po: Row; status: string }) => {
      const patch: Row = { status };
      if (status === "approved") {
        patch.approved_by = userId;
        patch.approved_at = new Date().toISOString();
      }
      if (status === "sent") patch.sent_at = new Date().toISOString();
      if (status === "closed") patch.closed_at = new Date().toISOString();
      const { error } = await db.from("purchase_orders").update(patch).eq("id", po.id);
      if (error) throw error;
      await db.rpc("log_audit_event", {
        _business_id: businessId,
        _action: `po_${status}`,
        _module: "purchasing",
        _record_id: po.po_number,
        _old_value: { status: po.status },
        _new_value: { status },
      });
      return status;
    },
    onSuccess: (status) => {
      toast.success(`Order moved to ${titleCase(status)}`);
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update the order status"),
  });

  const duplicate = useMutation({
    mutationFn: async (po: Row) => {
      const { data: lines } = await db
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", po.id);
      const number = await nextDocNumber(businessId!, "PO");
      const { data: copy, error } = await db
        .from("purchase_orders")
        .insert({
          business_id: businessId,
          supplier_id: po.supplier_id,
          warehouse_id: po.warehouse_id,
          po_number: number,
          status: "draft",
          order_date: todayISO(),
          currency: po.currency,
          payment_terms: po.payment_terms,
          shipping_cost: po.shipping_cost,
          discount: po.discount,
          other_charges: po.other_charges,
          subtotal: po.subtotal,
          tax: po.tax,
          total: po.total,
          notes: po.notes,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (lines?.length) {
        await db.from("purchase_order_items").insert(
          (lines as Row[]).map((l) => ({
            business_id: businessId,
            purchase_order_id: copy.id,
            product_id: l.product_id,
            variant_id: l.variant_id,
            supplier_sku: l.supplier_sku,
            unit: l.unit,
            quantity: l.quantity,
            received_quantity: 0,
            unit_cost: l.unit_cost,
            discount: l.discount,
            tax: l.tax,
            total: l.total,
          })),
        );
      }
    },
    onSuccess: () => {
      toast.success("Draft copy created");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not duplicate"),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await db.from("purchase_orders").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase order deleted");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  async function printPo(po: Row) {
    const { data } = await db
      .from("purchase_order_items")
      .select("*, products(name)")
      .eq("purchase_order_id", po.id);
    printDocument({
      title: "Purchase Order",
      business,
      doc: po,
      party: suppliers.find((s) => s.id === po.supplier_id) ?? null,
      items: (data ?? []).map((i: Row) => ({
        product_name: i.products?.name ?? "Item",
        quantity: i.quantity,
        unit_price: i.unit_cost,
        total: i.total,
      })),
      currency,
    });
  }

  async function openCreate() {
    const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];
    setForm({
      po_number: "",
      status: "draft",
      order_date: todayISO(),
      tax_rate: business?.tax_rate ?? 0,
      currency,
      exchange_rate: 1,
      warehouse_id: defaultLocation?.id,
      landed_cost_method: "none",
      shipping_cost: 0,
      discount: 0,
      other_charges: 0,
    });
    setItems([emptyLine()]);
    setOpen(true);
  }

  function statusTone(status: string) {
    if (status === "received" || status === "closed") return "default";
    if (status === "cancelled") return "destructive";
    return "secondary";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Order from suppliers. Stock only moves when a goods receipt is confirmed."
        actions={
          canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New order
            </Button>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO number..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PO_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {titleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No purchase orders"
          description="Create an order to restock products from your suppliers."
          action={canWrite ? <Button onClick={openCreate}>Create order</Button> : undefined}
        />
      ) : (
        <>
          <div className="surface-panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const p = progress[row.id];
                  const next = PO_TRANSITIONS[String(row.status)] ?? [];
                  const canReceive = canWrite && RECEIVABLE_STATUSES.includes(String(row.status));
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {row.po_number}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.suppliers?.name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.warehouses?.name ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.order_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.expected_date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatCurrency(row.total, row.currency ?? currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {p ? `${formatNumber(p.received, 0)}/${formatNumber(p.ordered, 0)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusTone(String(row.status)) as any}>
                          {titleCase(String(row.status))}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewing(row)}
                          aria-label="View"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => printPo(row)}
                          aria-label="Print"
                        >
                          <Printer className="size-4" />
                        </Button>
                        {canWrite && next.includes("pending_approval") && !canApprove && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setStatus.mutate({ po: row, status: "pending_approval" })
                            }
                            title="Submit for owner approval"
                            aria-label="Submit for approval"
                          >
                            <Send className="size-4" />
                          </Button>
                        )}
                        {canApprove && next.includes("approved") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setStatus.mutate({ po: row, status: "approved" })}
                            title="Approve purchase order"
                            aria-label="Approve"
                          >
                            <CheckCircle2 className="size-4 text-primary" />
                          </Button>
                        )}
                        {canWrite && next.includes("sent") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setStatus.mutate({ po: row, status: "sent" })}
                            title="Mark as sent to supplier"
                            aria-label="Send"
                          >
                            <Send className="size-4 text-primary" />
                          </Button>
                        )}
                        {canReceive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setReceiving(row)}
                            title="Receive goods"
                            aria-label="Receive goods"
                          >
                            <PackageCheck className="size-4" />
                          </Button>
                        )}
                        {canWrite && feature("enable_returns") && (p?.received ?? 0) > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setReturning(row)}
                            title="Return goods to supplier"
                            aria-label="Return goods to supplier"
                          >
                            <Undo2 className="size-4" />
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => duplicate.mutate(row)}
                            title="Duplicate as draft"
                            aria-label="Duplicate"
                          >
                            <Copy className="size-4" />
                          </Button>
                        )}
                        {canWrite && next.includes("cancelled") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setStatus.mutate({ po: row, status: "cancelled" })}
                            title="Cancel order"
                            aria-label="Cancel"
                          >
                            <Ban className="size-4 text-destructive" />
                          </Button>
                        )}
                        {canWrite && row.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(row)}
                            aria-label="Delete"
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* -------- create -------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
            <DialogDescription>
              Products from the chosen supplier's catalog are listed first with their agreed price.
              Creating this order does not change stock.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Supplier *</Label>
              <Select
                value={form.supplier_id ?? undefined}
                onValueChange={(v) => {
                  const s = suppliers.find((x) => x.id === v);
                  setForm({
                    ...form,
                    supplier_id: v,
                    payment_terms: s?.payment_terms ?? form.payment_terms,
                    currency: s?.currency || form.currency,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Deliver to</Label>
              <Select
                value={form.warehouse_id ?? undefined}
                onValueChange={(v) => setForm({ ...form, warehouse_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Payment terms</Label>
              <Select
                value={form.payment_terms ?? undefined}
                onValueChange={(v) => setForm({ ...form, payment_terms: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Terms" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Order date</Label>
              <Input
                type="date"
                value={form.order_date ?? ""}
                onChange={(e) => setForm({ ...form, order_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Expected delivery</Label>
              <Input
                type="date"
                value={form.expected_date ?? ""}
                onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Tax rate (%)</Label>
              <Input
                type="number"
                step="any"
                value={form.tax_rate ?? 0}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Currency</Label>
              <Input
                value={form.currency ?? ""}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Exchange rate</Label>
              <Input
                type="number"
                step="any"
                value={form.exchange_rate ?? 1}
                onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Landed cost</Label>
              <Select
                value={form.landed_cost_method ?? "none"}
                onValueChange={(v) => setForm({ ...form, landed_cost_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANDED_COST_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems([...items, emptyLine()])}
              >
                <Plus className="size-4" /> Add line
              </Button>
            </div>
            {items.map((item) => {
              const variance = priceVariance(item.unit_cost, item.last_price);
              const warn = variance !== null && Math.abs(variance) >= DEFAULT_PRICE_ALERT_PERCENT;
              const belowMoq = item.moq > 0 && item.quantity < item.moq;
              return (
                <div key={item.key} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,2fr)_90px_110px_100px_100px_auto]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <Label className="mb-1 block text-[11px] text-muted-foreground">
                        Product
                      </Label>
                      <Select
                        value={item.product_id ?? undefined}
                        onValueChange={(v) => pickProduct(item.key, v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {productOptions.inCatalog.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              ★ {p.name}
                            </SelectItem>
                          ))}
                          {productOptions.rest.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {variantsFor(item.product_id).length > 0 && (
                        <div className="mt-2">
                          <Label className="mb-1 block text-[11px] text-muted-foreground">
                            Variant
                          </Label>
                          <Select
                            value={item.variant_id ?? undefined}
                            onValueChange={(v) => pickVariant(item.key, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select variant" />
                            </SelectTrigger>
                            <SelectContent>
                              {variantsFor(item.product_id).map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {v.name}
                                  {v.sku ? ` · ${v.sku}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">Qty</Label>
                      <Input
                        type="number"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateLine(item.key, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">
                        Unit cost
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        value={item.unit_cost}
                        onChange={(e) =>
                          updateLine(item.key, { unit_cost: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">
                        Discount
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        value={item.discount}
                        onChange={(e) => updateLine(item.key, { discount: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] text-muted-foreground">Tax</Label>
                      <Input
                        type="number"
                        step="any"
                        value={item.tax}
                        onChange={(e) => updateLine(item.key, { tax: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(poLineTotal(item), form.currency ?? currency)}
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
                  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    {item.supplier_sku && <span>SKU {item.supplier_sku}</span>}
                    {item.last_price != null && (
                      <span>
                        Last purchase {formatCurrency(item.last_price, form.currency ?? currency)}
                      </span>
                    )}
                    {item.moq > 0 && <span>MOQ {item.moq}</span>}
                  </div>
                  {warn && (
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                      <AlertTriangle className="size-3.5" />
                      Purchase price {variance! > 0 ? "increased" : "decreased"} by{" "}
                      {Math.abs(variance!).toFixed(1)}% versus the last purchase.
                    </p>
                  )}
                  {belowMoq && (
                    <p className="text-[11px] font-medium text-destructive">
                      Below the supplier minimum order quantity of {item.moq}.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <Label className="mb-1.5 block text-xs">Shipping</Label>
              <Input
                type="number"
                step="any"
                value={form.shipping_cost ?? 0}
                onChange={(e) => setForm({ ...form, shipping_cost: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Order discount</Label>
              <Input
                type="number"
                step="any"
                value={form.discount ?? 0}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Other charges</Label>
              <Input
                type="number"
                step="any"
                value={form.other_charges ?? 0}
                onChange={(e) => setForm({ ...form, other_charges: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">PO number</Label>
              <Input
                placeholder="Auto"
                value={form.po_number ?? ""}
                onChange={(e) => setForm({ ...form, po_number: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border border-border p-3 text-sm">
            {[
              ["Subtotal", subtotal],
              ["Tax", tax],
              ["Shipping", shipping],
              ["Other charges", other],
              ["Discount", -discount],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span>{formatCurrency(value as number, form.currency ?? currency)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Grand total</span>
              <span>{formatCurrency(grandTotal, form.currency ?? currency)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Create order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- detail -------- */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order {viewing?.po_number}</DialogTitle>
            <DialogDescription>
              {viewing?.suppliers?.name ?? "No supplier"} · {formatDate(viewing?.order_date)} ·
              expected {formatDate(viewing?.expected_date)} ·{" "}
              {viewing?.warehouses?.name ?? "No location"}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewItems.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.products?.name ?? "Item"}
                    {i.supplier_sku && (
                      <span className="block text-[11px] text-muted-foreground">
                        SKU {i.supplier_sku}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(i.quantity, 0)}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(i.received_quantity ?? 0, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(
                      Math.max(
                        0,
                        Number(i.quantity) -
                          Number(i.received_quantity ?? 0) -
                          Number(i.damaged_quantity ?? 0) -
                          Number(i.rejected_quantity ?? 0),
                      ),
                      0,
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(i.unit_cost, viewing?.currency ?? currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(i.total, viewing?.currency ?? currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            {viewing && (
              <>
                {[
                  ["Subtotal", viewing.subtotal],
                  ["Tax", viewing.tax],
                  ["Shipping", viewing.shipping_cost],
                  ["Other", viewing.other_charges],
                  ["Discount", -Number(viewing.discount ?? 0)],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span>{formatCurrency(Number(value ?? 0), viewing.currency ?? currency)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Grand total</span>
                  <span>{formatCurrency(viewing.total, viewing.currency ?? currency)}</span>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {receiving && (
        <ReceiveDialog
          order={receiving}
          open={!!receiving}
          onClose={() => setReceiving(null)}
          trackBatch={feature("track_batch")}
          trackExpiry={feature("track_expiry")}
          trackSerial={feature("track_serial")}
        />
      )}

      <SupplierReturnDialog order={returning} onOpenChange={(o) => !o && setReturning(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft order?</AlertDialogTitle>
            <AlertDialogDescription>
              Only draft orders can be deleted. Orders with receipts must be cancelled or closed so
              history stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/purchase-orders")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — Daraven ERP" },
      {
        name: "description",
        content: "Raise supplier orders, approve them and receive goods with full audit history.",
      },
      { property: "og:title", content: "Purchase Orders — Daraven ERP" },
      {
        property: "og:description",
        content: "Raise supplier orders, approve them and receive goods with full audit history.",
      },
    ],
  }),
  component: PurchaseOrdersPage,
});
