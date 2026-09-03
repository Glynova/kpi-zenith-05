/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, formatNumber } from "@/lib/format";

const description =
  "Move stock between locations. Every transfer writes auditable out and in movements and updates both balances.";

export const Route = createFileRoute("/_authenticated/_shell/transfers")({
  head: () => ({
    meta: [
      { title: "Stock Transfers — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Stock Transfers — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransfersPage,
});

function TransfersPage() {
  const { businessId, canWrite, userId } = useBusiness();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Row>({ quantity: 1 });

  const { data: products } = useQuery({
    queryKey: ["transfer-products", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((await db.from("products").select("id, name, unit, cost_price, average_cost").eq("business_id", businessId).limit(500)).data ??
        []) as Row[],
  });

  const { data: locations } = useQuery({
    queryKey: ["transfer-locations", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((await db.from("warehouses").select("*").eq("business_id", businessId).limit(200)).data ??
        []) as Row[],
  });

  const { data: history } = useQuery({
    queryKey: ["transfer-history", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((
        await db
          .from("inventory_movements")
          .select("*, products(name)")
          .eq("business_id", businessId)
          .in("type", ["transfer_out", "transfer_in"])
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? []) as Row[],
  });

  const { data: balances } = useQuery({
    queryKey: ["transfer-balances", businessId, form.product_id],
    enabled: !!businessId && !!form.product_id,
    queryFn: async () =>
      ((
        await db
          .from("inventory_balances")
          .select("*")
          .eq("business_id", businessId)
          .eq("product_id", form.product_id)
      ).data ?? []) as Row[],
  });

  const locationName = useMemo(() => {
    const map: Record<string, string> = {};
    (locations ?? []).forEach((l) => (map[l.id] = l.name));
    return map;
  }, [locations]);

  const available = useMemo(() => {
    if (!form.from_id) return null;
    const row = (balances ?? []).find((b) => b.warehouse_id === form.from_id);
    return row ? Number(row.quantity) : 0;
  }, [balances, form.from_id]);

  const transfer = useMutation({
    mutationFn: async () => {
      const qty = Number(form.quantity);
      if (!form.product_id) throw new Error("Choose a product");
      if (!form.from_id || !form.to_id) throw new Error("Choose both locations");
      if (form.from_id === form.to_id) throw new Error("Source and destination must differ");
      if (!qty || qty <= 0) throw new Error("Quantity must be greater than zero");
      if (available !== null && qty > available)
        throw new Error(`Only ${formatNumber(available, 2)} available at the source location`);

      const product = (products ?? []).find((p) => p.id === form.product_id);
      const { error } = await db.from("inventory_movements").insert({
        business_id: businessId,
        product_id: form.product_id,
        warehouse_id: form.from_id,
        to_warehouse_id: form.to_id,
        type: "transfer_out",
        quantity: qty,
        base_quantity: qty,
        unit: product?.unit ?? null,
        unit_cost: Number(product?.average_cost ?? product?.cost_price ?? 0),
        total_cost: qty * Number(product?.average_cost ?? product?.cost_price ?? 0),
        reference: `Transfer ${locationName[form.from_id]} → ${locationName[form.to_id]}`,
        notes: form.notes || null,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock transferred");
      setForm({ quantity: 1 });
      queryClient.invalidateQueries({ queryKey: ["transfer-history", businessId] });
      queryClient.invalidateQueries({ queryKey: ["transfer-balances"] });
      queryClient.invalidateQueries({ queryKey: ["resource"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Transfer failed"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Transfers" description={description} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New transfer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <Label className="text-xs">Product</Label>
            <Select
              value={form.product_id ?? undefined}
              onValueChange={(v) => setForm({ ...form, product_id: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">From location</Label>
            <Select
              value={form.from_id ?? undefined}
              onValueChange={(v) => setForm({ ...form, from_id: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {(locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {available !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Available: {formatNumber(available, 2)}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <Label className="text-xs">To location</Label>
            <Select
              value={form.to_id ?? undefined}
              onValueChange={(v) => setForm({ ...form, to_id: v })}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent>
                {(locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Quantity</Label>
            <Input
              className="mt-1.5"
              type="number"
              step="any"
              value={form.quantity ?? ""}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label className="text-xs">Notes</Label>
            <Input
              className="mt-1.5"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional reference"
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full gap-2"
              disabled={!canWrite || transfer.isPending}
              onClick={() => transfer.mutate()}
            >
              <ArrowLeftRight className="size-4" />
              {transfer.isPending ? "Transferring..." : "Transfer stock"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer history</CardTitle>
        </CardHeader>
        <CardContent>
          {!history?.length ? (
            <EmptyState
              title="No transfers yet"
              description="Transfers between your locations will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDate(m.created_at)}</TableCell>
                      <TableCell>{m.products?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{locationName[m.warehouse_id] ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{locationName[m.to_warehouse_id] ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(m.quantity, 2)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.reference ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
