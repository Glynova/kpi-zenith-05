/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Eye, Printer, FileText, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, titleCase, todayISO } from "@/lib/format";
import { printDocument } from "@/lib/print";
import { PageHeader, EmptyState } from "@/components/page-header";
import { ReturnDialog } from "@/components/return-dialog";
import {
  LineItemsEditor,
  emptyLine,
  itemsCost,
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

const SALE_TYPES = ["walk_in", "wholesale", "credit", "return", "refund"];
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "mobile_money", "cheque", "credit"];

function SalesPage() {
  const { businessId, business, currency, canWrite, userId, feature } = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [form, setForm] = useState<Row>({});

  const salesQuery = useQuery({
    queryKey: ["sales", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("sales")
        .select("*, customers(name,email,phone)")
        .eq("business_id", businessId)
        .order("sale_date", { ascending: false })
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
        .select("id,name,selling_price,cost_price,average_cost,tax_rate,stock")
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
        .select("id,product_id,name,sku,barcode,selling_price,cost_price,stock,status")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-lite", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("customers")
        .select("id,name,email,phone")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: viewItems = [] } = useQuery({
    queryKey: ["sale-items", viewing?.id],
    enabled: !!viewing?.id,
    queryFn: async () => {
      const { data } = await db.from("sale_items").select("*").eq("sale_id", viewing!.id);
      return (data ?? []) as Row[];
    },
  });

  const subtotal = itemsSubtotal(items);
  const discount = Number(form.discount ?? 0);
  const taxRate = Number(form.tax_rate ?? business?.tax_rate ?? 0);
  const tax = Math.max(0, ((subtotal - discount) * taxRate) / 100);
  const total = Math.max(0, subtotal - discount + tax);
  const paid = form.payment_status === "paid" ? total : Number(form.paid ?? 0);

  const save = useMutation({
    mutationFn: async () => {
      const valid = items.filter((i) => i.product_id && i.quantity > 0);
      if (!valid.length) throw new Error("Add at least one line item");
      for (const i of valid) {
        const needsVariant = productVariants.some(
          (v) => v.product_id === i.product_id && v.status !== "archived",
        );
        if (needsVariant && !i.variant_id)
          throw new Error(`Choose a variant for ${i.product_name || "the selected product"}`);
      }
      if (!form.sale_number) throw new Error("Sale number is required");

      const { data: sale, error } = await db
        .from("sales")
        .insert({
          business_id: businessId,
          customer_id: form.customer_id || null,
          sale_number: form.sale_number,
          sale_type: form.sale_type ?? "walk_in",
          status: "completed",
          payment_method: form.payment_method ?? "cash",
          payment_status: form.payment_status ?? "paid",
          sale_date: form.sale_date ?? todayISO(),
          subtotal,
          discount,
          tax,
          total,
          paid,
          cost_total: itemsCost(valid),
          notes: form.notes || null,
          created_by: userId,
        })
        .select("id, sale_number, sale_date, customer_id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await db.from("sale_items").insert(
        valid.map((i) => ({
          business_id: businessId,
          sale_id: sale.id,
          product_id: i.product_id,
          variant_id: i.variant_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          unit_cost: i.unit_cost,
          discount: i.discount,
          tax: 0,
          total: lineTotal(i),
        })),
      );
      if (itemsError) throw itemsError;

      // Stock movements keep product stock in sync (trigger applies the delta).
      const { error: moveError } = await db.from("inventory_movements").insert(
        valid.map((i) => ({
          business_id: businessId,
          product_id: i.product_id,
          variant_id: i.variant_id,
          type: "sale_out",
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          reference: sale.sale_number,
          notes: "Auto-generated from sale",
          created_by: userId,
        })),
      );
      if (moveError) throw moveError;

      const balance = total - paid;
      if (balance > 0.001) {
        await db.from("accounts_receivable").insert({
          business_id: businessId,
          customer_id: sale.customer_id,
          sale_id: sale.id,
          amount: balance,
          paid: 0,
          due_date: form.due_date || null,
          status: "open",
          notes: `Balance from sale ${sale.sale_number}`,
        });
      }
      if (paid > 0.001) {
        await db.from("cash_transactions").insert({
          business_id: businessId,
          type: "inflow",
          amount: paid,
          category: "sales",
          description: `Payment for sale ${sale.sale_number}`,
          reference: sale.sale_number,
          transaction_date: sale.sale_date,
          created_by: userId,
        });
      }
      return sale;
    },
    onSuccess: () => {
      toast.success("Sale recorded — stock and cash updated");
      queryClient.invalidateQueries({ queryKey: ["sales", businessId] });
      queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", businessId] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not record the sale"),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await db.from("sales").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sale deleted");
      queryClient.invalidateQueries({ queryKey: ["sales", businessId] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const createInvoice = useMutation({
    mutationFn: async (sale: Row) => {
      const { data: existing } = await db
        .from("invoices")
        .select("id")
        .eq("sale_id", sale.id)
        .maybeSingle();
      if (existing) throw new Error("An invoice already exists for this sale");
      const { error } = await db.from("invoices").insert({
        business_id: businessId,
        sale_id: sale.id,
        customer_id: sale.customer_id,
        invoice_number: `INV-${String(sale.sale_number).replace(/^SO-?/i, "")}`,
        status: Number(sale.paid) >= Number(sale.total) ? "paid" : "unpaid",
        issue_date: sale.sale_date,
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        total: sale.total,
        paid: sale.paid,
        terms: business?.invoice_terms ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice created");
      queryClient.invalidateQueries({ queryKey: ["resource", "invoices", businessId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create the invoice"),
  });

  async function printSale(sale: Row) {
    const { data } = await db.from("sale_items").select("*").eq("sale_id", sale.id);
    const customer = customers.find((c) => c.id === sale.customer_id) ?? null;
    printDocument({
      title: "Receipt",
      business,
      doc: sale,
      party: customer,
      items: data ?? [],
      currency,
    });
  }

  function openCreate() {
    setForm({
      sale_number: `SO-${Date.now().toString().slice(-6)}`,
      sale_type: "walk_in",
      payment_method: "cash",
      payment_status: "paid",
      sale_date: todayISO(),
      discount: 0,
      tax_rate: business?.tax_rate ?? 0,
      paid: 0,
    });
    setItems([emptyLine()]);
    setOpen(true);
  }

  const rows = useMemo(() => {
    const list = salesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.sale_number, r.sale_type, r.payment_method, r.customers?.name].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [salesQuery.data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Record walk-in, wholesale and credit sales with live stock, cash and receivables updates."
        actions={
          canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New sale
            </Button>
          )
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sales..."
          className="pl-9"
        />
      </div>

      {salesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No sales yet"
          description="Record your first sale to start tracking revenue, margin and stock."
          action={canWrite ? <Button onClick={openCreate}>Record a sale</Button> : undefined}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-medium">{row.sale_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(row.sale_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.customers?.name ?? <span className="text-muted-foreground">Walk-in</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{titleCase(String(row.sale_type))}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatCurrency(row.total, currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatCurrency(row.paid, currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.payment_status === "paid" ? "default" : "secondary"}>
                      {titleCase(String(row.payment_status))}
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
                      onClick={() => printSale(row)}
                      aria-label="Print receipt"
                    >
                      <Printer className="size-4" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => createInvoice.mutate(row)}
                          aria-label="Create invoice"
                        >
                          <FileText className="size-4" />
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
            <DialogTitle>New sale</DialogTitle>
            <DialogDescription>
              Stock, cash flow and receivables are updated automatically when you save.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5 block text-xs">Sale number *</Label>
              <Input
                value={form.sale_number ?? ""}
                onChange={(e) => setForm({ ...form, sale_number: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Date</Label>
              <Input
                type="date"
                value={form.sale_date ?? ""}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Customer</Label>
              <Select
                value={form.customer_id ?? undefined}
                onValueChange={(v) => setForm({ ...form, customer_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Walk-in" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Sale type</Label>
              <Select
                value={form.sale_type}
                onValueChange={(v) => setForm({ ...form, sale_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {titleCase(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Payment method</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm({ ...form, payment_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {titleCase(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Payment status</Label>
              <Select
                value={form.payment_status}
                onValueChange={(v) => setForm({ ...form, payment_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["paid", "partial", "unpaid"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {titleCase(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <LineItemsEditor
            items={items}
            setItems={setItems}
            products={products}
            variants={productVariants}
            currency={currency}
          />

          <div className="grid gap-4 sm:grid-cols-3">
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
              <Label className="mb-1.5 block text-xs">Tax rate (%)</Label>
              <Input
                type="number"
                step="any"
                value={form.tax_rate ?? 0}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Amount paid</Label>
              <Input
                type="number"
                step="any"
                disabled={form.payment_status === "paid"}
                value={form.payment_status === "paid" ? total.toFixed(2) : (form.paid ?? 0)}
                onChange={(e) => setForm({ ...form, paid: e.target.value })}
              />
            </div>
            {form.payment_status !== "paid" && (
              <div>
                <Label className="mb-1.5 block text-xs">Balance due date</Label>
                <Input
                  type="date"
                  value={form.due_date ?? ""}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            )}
            <div className="sm:col-span-3">
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
              <span className="text-muted-foreground">Discount</span>
              <span>-{formatCurrency(discount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(tax, currency)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total, currency)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Balance</span>
              <span>{formatCurrency(total - paid, currency)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Record sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale {viewing?.sale_number}</DialogTitle>
            <DialogDescription>
              {formatDate(viewing?.sale_date)} · {viewing?.customers?.name ?? "Walk-in customer"}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewItems.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.product_name}</TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(i.total, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-between border-t border-border pt-3 font-semibold">
            <span>Total</span>
            <span>{formatCurrency(viewing?.total, currency)}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => viewing && printSale(viewing)}>
              <Printer className="size-4" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              The sale and its line items are removed. Stock movements already posted are kept for
              the audit trail.
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

export const Route = createFileRoute("/_authenticated/_shell/sales")({
  head: () => ({
    meta: [
      { title: "Sales — Daraven ERP" },
      {
        name: "description",
        content: "Record sales with line items, automatic stock deduction and receivables.",
      },
      { property: "og:title", content: "Sales — Daraven ERP" },
      {
        property: "og:description",
        content: "Record sales with line items, automatic stock deduction and receivables.",
      },
    ],
  }),
  component: SalesPage,
});
