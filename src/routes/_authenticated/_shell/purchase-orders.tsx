/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Eye, PackageCheck, Printer, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, titleCase, todayISO } from "@/lib/format";
import { APPROVAL_STATUSES, canApprovePurchaseOrders } from "@/lib/permissions";
import { printDocument } from "@/lib/print";
import { PageHeader, EmptyState } from "@/components/page-header";
import {
  LineItemsEditor,
  emptyLine,
  itemsSubtotal,
  lineTotal,
  type LineItem,
} from "@/components/line-items";
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

const STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "completed",
  "cancelled",
];

function PurchaseOrdersPage() {
  const { businessId, business, currency, canWrite, userId, role } = useBusiness();
  const canApprove = canApprovePurchaseOrders(role);
  const selectableStatuses = canApprove
    ? STATUSES
    : STATUSES.filter((s) => !APPROVAL_STATUSES.includes(s));
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [receiving, setReceiving] = useState<Row | null>(null);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [form, setForm] = useState<Row>({});

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_orders")
        .select("*, suppliers(name,email,phone)")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-lite", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id,name,selling_price,cost_price,stock")
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
        .select("id,name,email,phone")
        .eq("business_id", businessId)
        .order("name");
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

  const subtotal = itemsSubtotal(items);
  const taxRate = Number(form.tax_rate ?? business?.tax_rate ?? 0);
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax;

  const save = useMutation({
    mutationFn: async () => {
      const valid = items.filter((i) => i.product_id && i.quantity > 0);
      if (!valid.length) throw new Error("Add at least one line item");
      if (!form.po_number) throw new Error("PO number is required");

      const { data: po, error } = await db
        .from("purchase_orders")
        .insert({
          business_id: businessId,
          supplier_id: form.supplier_id || null,
          po_number: form.po_number,
          status: form.status ?? "draft",
          order_date: form.order_date ?? todayISO(),
          expected_date: form.expected_date || null,
          subtotal,
          tax,
          total,
          paid: Number(form.paid ?? 0),
          notes: form.notes || null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from("purchase_order_items").insert(
        valid.map((i) => ({
          business_id: businessId,
          purchase_order_id: po.id,
          product_id: i.product_id,
          quantity: i.quantity,
          received_quantity: 0,
          unit_cost: i.unit_price,
          total: lineTotal(i),
        })),
      );
      if (itemsError) throw itemsError;
      return po;
    },
    onSuccess: () => {
      toast.success("Purchase order created");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save the purchase order"),
  });

  const receive = useMutation({
    mutationFn: async (po: Row) => {
      const { data: poItems, error } = await db
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", po.id);
      if (error) throw error;
      const pending = (poItems ?? []).filter(
        (i: Row) => Number(i.quantity) - Number(i.received_quantity ?? 0) > 0,
      );
      if (!pending.length) throw new Error("Everything on this order is already received");

      const { error: moveError } = await db.from("inventory_movements").insert(
        pending.map((i: Row) => ({
          business_id: businessId,
          product_id: i.product_id,
          type: "stock_in",
          quantity: Number(i.quantity) - Number(i.received_quantity ?? 0),
          unit_cost: i.unit_cost,
          reference: po.po_number,
          notes: "Received against purchase order",
          created_by: userId,
        })),
      );
      if (moveError) throw moveError;

      for (const i of pending) {
        await db
          .from("purchase_order_items")
          .update({ received_quantity: i.quantity })
          .eq("id", i.id);
      }

      await db
        .from("purchase_orders")
        .update({ status: "received" })
        .eq("id", po.id);

      const balance = Number(po.total ?? 0) - Number(po.paid ?? 0);
      if (balance > 0.001) {
        await db.from("accounts_payable").insert({
          business_id: businessId,
          supplier_id: po.supplier_id,
          purchase_order_id: po.id,
          amount: balance,
          paid: 0,
          due_date: po.expected_date ?? null,
          status: "open",
          notes: `Balance from PO ${po.po_number}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("Order received — stock and payables updated");
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", businessId] });
      queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
      setReceiving(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not receive the order"),
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

  function openCreate() {
    setForm({
      po_number: `PO-${Date.now().toString().slice(-6)}`,
      status: "draft",
      order_date: todayISO(),
      tax_rate: business?.tax_rate ?? 0,
      paid: 0,
    });
    setItems([emptyLine()]);
    setOpen(true);
  }

  const rows = useMemo(() => {
    const list = ordersQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.po_number, r.status, r.suppliers?.name].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [ordersQuery.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Order from suppliers, then receive stock in one click to update inventory and payables."
        actions={
          canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New order
            </Button>
          )
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search orders..."
          className="pl-9"
        />
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
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Ordered</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">{row.po_number}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.suppliers?.name ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(row.order_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(row.expected_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatCurrency(row.total, currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "received" ? "default" : "secondary"}>
                      {titleCase(String(row.status))}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(row)} aria-label="View">
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => printPo(row)} aria-label="Print">
                      <Printer className="size-4" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={row.status === "received"}
                          onClick={() => setReceiving(row)}
                          aria-label="Receive stock"
                        >
                          <PackageCheck className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New purchase order</DialogTitle>
            <DialogDescription>
              Add products at cost price. Stock only moves when you receive the order.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5 block text-xs">PO number *</Label>
              <Input
                value={form.po_number ?? ""}
                onChange={(e) => setForm({ ...form, po_number: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Supplier</Label>
              <Select
                value={form.supplier_id ?? undefined}
                onValueChange={(v) => setForm({ ...form, supplier_id: v })}
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
              <Label className="mb-1.5 block text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {titleCase(s)}
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
              <Label className="mb-1.5 block text-xs">Expected date</Label>
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
          </div>

          <LineItemsEditor
            items={items}
            setItems={setItems}
            products={products}
            currency={currency}
            priceKey="cost_price"
            priceLabel="Unit cost"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs">Amount paid upfront</Label>
              <Input
                type="number"
                step="any"
                value={form.paid ?? 0}
                onChange={(e) => setForm({ ...form, paid: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Notes</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(tax, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
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

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Order {viewing?.po_number}</DialogTitle>
            <DialogDescription>
              {viewing?.suppliers?.name ?? "No supplier"} · {formatDate(viewing?.order_date)}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewItems.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.products?.name ?? "Item"}</TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  <TableCell className="text-right">{i.received_quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(i.total, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive all outstanding items?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock is increased for every pending line, the order is marked received and any
              unpaid balance is posted to payables.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => receiving && receive.mutate(receiving)}>
              Receive stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this purchase order?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
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
      { title: "Purchase Orders — KPIOptiva" },
      {
        name: "description",
        content: "Supplier orders with line items, one-click receiving and automatic payables.",
      },
      { property: "og:title", content: "Purchase Orders — KPIOptiva" },
      {
        property: "og:description",
        content: "Supplier orders with line items, one-click receiving and automatic payables.",
      },
    ],
  }),
  component: PurchaseOrdersPage,
});
