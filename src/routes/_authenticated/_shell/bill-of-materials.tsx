/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Factory, Pencil } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatNumber, titleCase } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
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

type Component = { key: string; component_product_id: string | null; quantity: number };

const TYPES = ["recipe", "assembly", "bundle", "manufacturing"];

function newComponent(): Component {
  return { key: Math.random().toString(36).slice(2), component_product_id: null, quantity: 1 };
}

function BomPage() {
  const { businessId, currency, canWrite } = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [producing, setProducing] = useState<Row | null>(null);
  const [batches, setBatches] = useState(1);
  const [form, setForm] = useState<Row>({});
  const [components, setComponents] = useState<Component[]>([newComponent()]);

  const bomsQuery = useQuery({
    queryKey: ["boms", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("bill_of_materials")
        .select("*, products(name,stock)")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
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
        .select("id,name,cost_price,stock")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ["bom-items", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("bom_items")
        .select("*, products:component_product_id(name,cost_price,stock)")
        .eq("business_id", businessId);
      return (data ?? []) as Row[];
    },
  });

  const itemsByBom = useMemo(() => {
    const map: Record<string, Row[]> = {};
    allItems.forEach((i) => {
      (map[i.bom_id] ??= []).push(i);
    });
    return map;
  }, [allItems]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Name is required");
      if (!form.product_id) throw new Error("Select the finished product");
      const valid = components.filter((c) => c.component_product_id && c.quantity > 0);
      if (!valid.length) throw new Error("Add at least one component");

      const payload = {
        business_id: businessId,
        product_id: form.product_id,
        name: form.name,
        type: form.type ?? "recipe",
        output_quantity: Number(form.output_quantity ?? 1),
        notes: form.notes || null,
      };

      let bomId = editing?.id as string | undefined;
      if (bomId) {
        const { error } = await db.from("bill_of_materials").update(payload).eq("id", bomId);
        if (error) throw error;
        await db.from("bom_items").delete().eq("bom_id", bomId);
      } else {
        const { data, error } = await db
          .from("bill_of_materials")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        bomId = data.id;
      }

      const { error: itemsError } = await db.from("bom_items").insert(
        valid.map((c) => ({
          business_id: businessId,
          bom_id: bomId,
          component_product_id: c.component_product_id,
          quantity: c.quantity,
        })),
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      toast.success(editing ? "Bill of materials updated" : "Bill of materials created");
      queryClient.invalidateQueries({ queryKey: ["boms", businessId] });
      queryClient.invalidateQueries({ queryKey: ["bom-items", businessId] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const produce = useMutation({
    mutationFn: async ({ bom, qty }: { bom: Row; qty: number }) => {
      const { data, error } = await db.rpc("produce_from_bom", {
        _bom_id: bom.id,
        _batches: qty,
      });
      if (error) throw error;
      return { produced: Number(data ?? 0), name: bom.products?.name ?? bom.name };
    },
    onSuccess: (res) => {
      toast.success(`Produced ${formatNumber(res.produced, 2)} units of ${res.name}`);
      queryClient.invalidateQueries({ queryKey: ["boms", businessId] });
      queryClient.invalidateQueries({ queryKey: ["bom-items", businessId] });
      queryClient.invalidateQueries({ queryKey: ["products-lite", businessId] });
      queryClient.invalidateQueries({ queryKey: ["resource", "products", businessId] });
      setProducing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Production failed"),
  });


  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await db.from("bill_of_materials").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bill of materials deleted");
      queryClient.invalidateQueries({ queryKey: ["boms", businessId] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  function openCreate() {
    setForm({ type: "recipe", output_quantity: 1 });
    setComponents([newComponent()]);
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Row) {
    setForm({
      name: row.name,
      product_id: row.product_id,
      type: row.type,
      output_quantity: row.output_quantity,
      notes: row.notes ?? "",
    });
    setComponents(
      (itemsByBom[row.id] ?? []).map((i) => ({
        key: i.id,
        component_product_id: i.component_product_id,
        quantity: Number(i.quantity),
      })),
    );
    setEditing(row);
    setOpen(true);
  }

  const rows = useMemo(() => {
    const list = bomsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.name, r.type, r.products?.name].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [bomsQuery.data, search]);

  function unitCost(bom: Row) {
    const items = itemsByBom[bom.id] ?? [];
    const cost = items.reduce(
      (sum, i) => sum + Number(i.quantity) * Number(i.products?.cost_price ?? 0),
      0,
    );
    return cost / Math.max(1, Number(bom.output_quantity ?? 1));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill of Materials"
        description="Recipes, assemblies and bundles — run production to deduct components and add finished goods."
        actions={
          canWrite && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New BOM
            </Button>
          )
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="pl-9"
        />
      </div>

      {bomsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No bills of materials"
          description="Define what goes into your finished products to automate production."
          action={canWrite ? <Button onClick={openCreate}>Create BOM</Button> : undefined}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BOM</TableHead>
                <TableHead>Finished product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Components</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.products?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{titleCase(String(row.type))}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.output_quantity, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(itemsByBom[row.id] ?? []).length}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(unitCost(row), currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setBatches(1);
                            setProducing(row);
                          }}
                          aria-label="Run production"
                        >
                          <Factory className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
                          <Pencil className="size-4" />
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit bill of materials" : "New bill of materials"}</DialogTitle>
            <DialogDescription>
              Components are deducted from stock each time you run production.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-xs">Name *</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Finished product *</Label>
              <Select
                value={form.product_id ?? undefined}
                onValueChange={(v) => setForm({ ...form, product_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {titleCase(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Output quantity</Label>
              <Input
                type="number"
                step="any"
                value={form.output_quantity ?? 1}
                onChange={(e) => setForm({ ...form, output_quantity: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Components</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setComponents([...components, newComponent()])}
              >
                <Plus className="size-4" /> Add component
              </Button>
            </div>
            {components.map((c) => (
              <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_100px_auto] items-end gap-2">
                <div className="min-w-0">
                  <Select
                    value={c.component_product_id ?? undefined}
                    onValueChange={(v) =>
                      setComponents(
                        components.map((x) =>
                          x.key === c.key ? { ...x, component_product_id: v } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select component" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  step="any"
                  value={c.quantity}
                  onChange={(e) =>
                    setComponents(
                      components.map((x) =>
                        x.key === c.key ? { ...x, quantity: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setComponents(components.filter((x) => x.key !== c.key))}
                  aria-label="Remove component"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!producing} onOpenChange={(o) => !o && setProducing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run production</DialogTitle>
            <DialogDescription>
              {producing?.name} produces {formatNumber(producing?.output_quantity, 2)} unit(s) per
              batch.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="mb-1.5 block text-xs">Batches</Label>
            <Input
              type="number"
              min={1}
              step="any"
              value={batches}
              onChange={(e) => setBatches(Number(e.target.value))}
            />
          </div>
          <div className="rounded-lg border border-border p-3 text-sm">
            {(itemsByBom[producing?.id ?? ""] ?? []).map((i) => (
              <div key={i.id} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">{i.products?.name}</span>
                <span>
                  {formatNumber(Number(i.quantity) * batches, 2)} / {formatNumber(i.products?.stock, 2)} in stock
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProducing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => producing && produce.mutate({ bom: producing, qty: batches })}
              disabled={produce.isPending || batches <= 0}
            >
              {produce.isPending ? "Posting..." : "Produce"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bill of materials?</AlertDialogTitle>
            <AlertDialogDescription>
              Its components are removed too. Past production movements are kept.
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

export const Route = createFileRoute("/_authenticated/_shell/bill-of-materials")({
  head: () => ({
    meta: [
      { title: "Bill of Materials — KPIOptiva" },
      {
        name: "description",
        content: "Recipes and assemblies with one-click production that adjusts stock automatically.",
      },
      { property: "og:title", content: "Bill of Materials — KPIOptiva" },
      {
        property: "og:description",
        content: "Recipes and assemblies with one-click production that adjusts stock automatically.",
      },
    ],
  }),
  component: BomPage,
});
