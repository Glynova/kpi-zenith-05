/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Building2, Inbox, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { PageHeader, EmptyState } from "@/components/page-header";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";

const description =
  "Move stock between your own locations or send it to another business you belong to. Inter-business transfers are only added to the receiver once they confirm receipt.";

type TransferSearch = { incoming?: string; transfer?: string };

export const Route = createFileRoute("/_authenticated/_shell/transfers")({
  validateSearch: (search: Record<string, unknown>): TransferSearch => ({
    incoming: typeof search["incoming"] === "string" ? (search["incoming"] as string) : undefined,
    transfer: typeof search["transfer"] === "string" ? (search["transfer"] as string) : undefined,
  }),
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

const STATUS_TONE: Record<string, string> = {
  pending_receipt: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  received: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  partially_received: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  rejected: "bg-destructive/15 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  pending_receipt: "Awaiting receipt",
  received: "Received",
  partially_received: "Partially received",
  rejected: "Rejected",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_TONE[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

type Line = { key: string; product_id?: string; quantity: string };

function TransfersPage() {
  const { businessId, business, canWrite, memberships, currency } = useBusiness();
  const search = useSearch({ from: "/_authenticated/_shell/transfers" });
  const queryClient = useQueryClient();

  const [tab, setTab] = useState(search.incoming ? "incoming" : "new");
  const [destKind, setDestKind] = useState<"internal" | "external">("internal");
  const [destBusinessId, setDestBusinessId] = useState<string | null>(null);
  const [sourceWarehouse, setSourceWarehouse] = useState<string | null>(null);
  const [destWarehouse, setDestWarehouse] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), quantity: "1" }]);
  const [reviewId, setReviewId] = useState<string | null>(search.incoming ?? null);

  useEffect(() => {
    if (search.incoming) {
      setTab("incoming");
      setReviewId(search.incoming);
    }
  }, [search.incoming]);

  const effectiveDestBusiness = destKind === "internal" ? businessId : destBusinessId;

  /** Only businesses this user is an active, non-auditor member of are eligible. */
  const partnerBusinesses = useMemo(
    () =>
      memberships
        .filter((m) => m.business_id !== businessId && m.role !== "auditor")
        .map((m) => ({
          value: m.business_id,
          label: m.businesses?.name ?? "Business",
          hint: m.businesses?.type ?? undefined,
        })),
    [memberships, businessId],
  );

  const { data: products } = useQuery({
    queryKey: ["transfer-products", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((
        await db
          .from("products")
          .select("id, name, sku, barcode, unit, cost_price, average_cost")
          .eq("business_id", businessId)
          .limit(1000)
      ).data ?? []) as Row[],
  });

  const { data: sourceLocations } = useQuery({
    queryKey: ["transfer-locations", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((await db.from("warehouses").select("id, name").eq("business_id", businessId).limit(200))
        .data ?? []) as Row[],
  });

  const { data: destLocations } = useQuery({
    queryKey: ["transfer-locations", effectiveDestBusiness],
    enabled: !!effectiveDestBusiness,
    queryFn: async () =>
      ((
        await db
          .from("warehouses")
          .select("id, name")
          .eq("business_id", effectiveDestBusiness)
          .limit(200)
      ).data ?? []) as Row[],
  });

  const { data: balances } = useQuery({
    queryKey: ["transfer-balances", businessId, sourceWarehouse],
    enabled: !!businessId && !!sourceWarehouse,
    queryFn: async () =>
      ((
        await db
          .from("inventory_balances")
          .select("product_id, quantity, average_cost")
          .eq("business_id", businessId)
          .eq("warehouse_id", sourceWarehouse)
      ).data ?? []) as Row[],
  });

  const availableFor = (productId?: string) => {
    if (!productId) return null;
    const row = (balances ?? []).find((b) => b.product_id === productId);
    return row ? Number(row.quantity) : 0;
  };

  const costFor = (productId?: string) => {
    const bal = (balances ?? []).find((b) => b.product_id === productId);
    if (bal && Number(bal.average_cost) > 0) return Number(bal.average_cost);
    const p = (products ?? []).find((x) => x.id === productId);
    return Number(p?.average_cost || p?.cost_price || 0);
  };

  const estimatedValue = lines.reduce(
    (sum, l) => sum + Number(l.quantity || 0) * costFor(l.product_id),
    0,
  );

  const { data: outgoing } = useQuery({
    queryKey: ["transfers-outgoing", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((
        await db
          .from("stock_transfers")
          .select("*, stock_transfer_items(*)")
          .eq("source_business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? []) as Row[],
  });

  const { data: incoming } = useQuery({
    queryKey: ["transfers-incoming", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      ((
        await db
          .from("stock_transfers")
          .select("*, stock_transfer_items(*)")
          .eq("dest_business_id", businessId)
          .eq("is_cross_business", true)
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? []) as Row[],
  });

  const pendingIncoming = (incoming ?? []).filter((t) => t.status === "pending_receipt");

  const resetForm = () => {
    setLines([{ key: crypto.randomUUID(), quantity: "1" }]);
    setNotes("");
    setDestWarehouse(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!sourceWarehouse) throw new Error("Choose the source location");
      if (!effectiveDestBusiness) throw new Error("Choose the destination business");
      if (!destWarehouse) throw new Error("Choose the destination location");
      const payload = lines.map((l) => {
        const qty = Number(l.quantity);
        if (!l.product_id) throw new Error("Choose a product on every line");
        if (!qty || qty <= 0) throw new Error("Quantity must be greater than zero");
        const avail = availableFor(l.product_id) ?? 0;
        if (qty > avail)
          throw new Error(`Only ${formatNumber(avail, 2)} available at the source location`);
        return { product_id: l.product_id, quantity: qty };
      });

      const { data, error } = await db.rpc("create_stock_transfer", {
        _source_business_id: businessId,
        _source_warehouse_id: sourceWarehouse,
        _dest_business_id: effectiveDestBusiness,
        _dest_warehouse_id: destWarehouse,
        _items: payload,
        _notes: notes || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success(
        destKind === "external"
          ? "Transfer sent — waiting for the receiving business to confirm"
          : "Stock transferred",
      );
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["transfers-outgoing", businessId] });
      queryClient.invalidateQueries({ queryKey: ["transfer-balances"] });
      queryClient.invalidateQueries({ queryKey: ["resource"] });
      setTab("outgoing");
    },
    onError: (e: any) => toast.error(e.message ?? "Transfer failed"),
  });

  const reviewTransfer = (incoming ?? []).find((t) => t.id === reviewId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Stock Transfers" description={description} />

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="new" className="gap-2">
            <Plus className="size-4" /> New transfer
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2">
            <Send className="size-4" /> Outgoing
          </TabsTrigger>
          <TabsTrigger value="incoming" className="gap-2">
            <Inbox className="size-4" /> Incoming
            {pendingIncoming.length > 0 && (
              <Badge className="ml-1 px-1.5 py-0 text-[10px]">{pendingIncoming.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ---------------- New transfer ---------------- */}
        <TabsContent value="new" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where is the stock going?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <Label className="text-xs">Source business</Label>
                  <div className="mt-1.5 flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{business?.name ?? "Current business"}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <Label className="text-xs">Source location</Label>
                  <Select
                    value={sourceWarehouse ?? undefined}
                    onValueChange={(v) => setSourceWarehouse(v)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select source location" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sourceLocations ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["internal", "Within my business", "Location to location — applied immediately."],
                    [
                      "external",
                      "To another business",
                      "Needs the receiving business to confirm before their stock changes.",
                    ],
                  ] as const
                ).map(([kind, title, hint]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setDestKind(kind);
                      setDestWarehouse(null);
                    }}
                    aria-pressed={destKind === kind}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      destKind === kind
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {destKind === "external" && (
                  <div className="min-w-0">
                    <Label className="text-xs">Destination business</Label>
                    <div className="mt-1.5">
                      <SearchableSelect
                        options={partnerBusinesses}
                        value={destBusinessId}
                        onChange={(v) => {
                          setDestBusinessId(v);
                          setDestWarehouse(null);
                        }}
                        placeholder="Search businesses"
                        emptyText="No eligible businesses"
                      />
                    </div>
                    {partnerBusinesses.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        You are not a member of another business yet.
                      </p>
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <Label className="text-xs">Destination location</Label>
                  <Select
                    value={destWarehouse ?? undefined}
                    onValueChange={(v) => setDestWarehouse(v)}
                    disabled={!effectiveDestBusiness}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select destination location" />
                    </SelectTrigger>
                    <SelectContent>
                      {(destLocations ?? [])
                        .filter((l) => destKind === "external" || l.id !== sourceWarehouse)
                        .map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Products</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  setLines((l) => [...l, { key: crypto.randomUUID(), quantity: "1" }])
                }
              >
                <Plus className="size-4" /> Add line
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.map((line) => {
                const avail = availableFor(line.product_id);
                return (
                  <div key={line.key} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_140px_auto]">
                    <div className="min-w-0">
                      <Label className="text-xs">Product</Label>
                      <div className="mt-1.5">
                        <SearchableSelect
                          options={(products ?? []).map((p) => ({
                            value: p.id,
                            label: p.name,
                            hint: p.sku ?? undefined,
                          }))}
                          value={line.product_id}
                          onChange={(v) =>
                            setLines((ls) =>
                              ls.map((l) => (l.key === line.key ? { ...l, product_id: v } : l)),
                            )
                          }
                          placeholder="Search products"
                        />
                      </div>
                      {avail !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Available here: {formatNumber(avail, 2)}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        className="mt-1.5"
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((ls) =>
                            ls.map((l) =>
                              l.key === line.key ? { ...l, quantity: e.target.value } : l,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line"
                        disabled={lines.length === 1}
                        onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              <div>
                <Label className="text-xs">Notes / reference</Label>
                <Textarea
                  className="mt-1.5"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional reference for both businesses"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="max-w-full truncate">
                  {business?.name} ·{" "}
                  {(sourceLocations ?? []).find((l) => l.id === sourceWarehouse)?.name ?? "location"}
                </Badge>
                <ArrowLeftRight className="size-4 text-muted-foreground" />
                <Badge variant="secondary" className="max-w-full truncate">
                  {destKind === "external"
                    ? (partnerBusinesses.find((b) => b.value === destBusinessId)?.label ??
                      "destination business")
                    : business?.name}{" "}
                  · {(destLocations ?? []).find((l) => l.id === destWarehouse)?.name ?? "location"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {lines.filter((l) => l.product_id).length} product line(s) · estimated transfer value{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(estimatedValue, currency)}
                </span>
              </p>
              {destKind === "external" && (
                <p className="text-xs text-muted-foreground">
                  Stock leaves your location now and only appears in the receiving business after
                  they confirm receipt. If they reject it, the stock returns to your location.
                </p>
              )}
              <Button
                className="w-full gap-2 sm:w-auto"
                disabled={!canWrite || create.isPending}
                onClick={() => create.mutate()}
              >
                <ArrowLeftRight className="size-4" />
                {create.isPending ? "Submitting..." : "Submit transfer"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Outgoing ---------------- */}
        <TabsContent value="outgoing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfers sent</CardTitle>
            </CardHeader>
            <CardContent>
              {!outgoing?.length ? (
                <EmptyState
                  title="No transfers yet"
                  description="Transfers you create will appear here with their status."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead className="text-right">Lines</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outgoing.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(t.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">{t.reference}</TableCell>
                          <TableCell>{t.source_warehouse_name ?? "—"}</TableCell>
                          <TableCell>
                            <span className="block truncate">
                              {t.is_cross_business ? `${t.dest_business_name} · ` : ""}
                              {t.dest_warehouse_name ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {t.stock_transfer_items?.length ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(t.total_value), currency)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={t.status} />
                            {t.status === "rejected" && t.rejection_reason && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t.rejection_reason}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Incoming ---------------- */}
        <TabsContent value="incoming">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Incoming transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {!incoming?.length ? (
                <EmptyState
                  title="Nothing incoming"
                  description="Transfers sent to this business by another business will appear here for review."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To location</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incoming.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(t.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">{t.reference}</TableCell>
                          <TableCell>
                            <span className="block truncate">
                              {t.source_business_name} · {t.source_warehouse_name ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell>{t.dest_warehouse_name ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(Number(t.total_value), currency)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={t.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => setReviewId(t.id)}>
                              {t.status === "pending_receipt" ? "Review" : "View"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ReviewDialog
        transfer={reviewTransfer}
        products={products ?? []}
        currency={currency}
        canWrite={canWrite}
        onClose={() => setReviewId(null)}
        onDone={() => {
          setReviewId(null);
          queryClient.invalidateQueries({ queryKey: ["transfers-incoming", businessId] });
          queryClient.invalidateQueries({ queryKey: ["resource"] });
        }}
      />
    </div>
  );
}

/** Receiving-side review, confirm, partial receipt and rejection. */
function ReviewDialog({
  transfer,
  products,
  currency,
  canWrite,
  onClose,
  onDone,
}: {
  transfer: Row | null;
  products: Row[];
  currency: string;
  canWrite: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [state, setState] = useState<Record<string, { qty: string; dest?: string; reason: string }>>(
    {},
  );
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const items: Row[] = useMemo(() => transfer?.stock_transfer_items ?? [], [transfer]);
  const pending = transfer?.status === "pending_receipt";

  useEffect(() => {
    if (!transfer) return;
    const next: Record<string, { qty: string; dest?: string; reason: string }> = {};
    for (const it of items) {
      // Suggest the receiver's own catalog match by SKU, barcode, then name.
      const match =
        products.find((p) => it.product_sku && p.sku === it.product_sku) ??
        products.find((p) => it.product_barcode && p.barcode === it.product_barcode) ??
        products.find(
          (p) =>
            it.product_name &&
            String(p.name).toLowerCase() === String(it.product_name).toLowerCase(),
        );
      next[it.id] = {
        qty: String(it.received_quantity ?? it.quantity),
        dest: it.dest_product_id ?? match?.id,
        reason: it.discrepancy_reason ?? "",
      };
    }
    setState(next);
    setRejecting(false);
    setReason("");
  }, [transfer, items, products]);

  const receive = useMutation({
    mutationFn: async () => {
      const lines = items.map((it) => {
        const s = state[it.id];
        if (!s?.dest) throw new Error(`Choose a matching product for ${it.product_name}`);
        const qty = Number(s.qty);
        if (qty < 0 || qty > Number(it.quantity))
          throw new Error(`Received quantity for ${it.product_name} is out of range`);
        if (qty < Number(it.quantity) && !s.reason.trim())
          throw new Error(`A discrepancy reason is required for ${it.product_name}`);
        return {
          item_id: it.id,
          received_quantity: qty,
          dest_product_id: s.dest,
          discrepancy_reason: s.reason.trim() || null,
        };
      });
      const { error } = await db.rpc("receive_stock_transfer", {
        _transfer_id: transfer!.id,
        _lines: lines,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer received — stock added to your location");
      onDone();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not receive transfer"),
  });

  const reject = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("A rejection reason is required");
      const { error } = await db.rpc("reject_stock_transfer", {
        _transfer_id: transfer!.id,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer rejected — stock returned to the sender");
      onDone();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not reject transfer"),
  });

  return (
    <Dialog open={!!transfer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {transfer && (
          <>
            <DialogHeader>
              <DialogTitle>Transfer {transfer.reference}</DialogTitle>
              <DialogDescription>
                From {transfer.source_business_name} · {transfer.source_warehouse_name} into{" "}
                {transfer.dest_warehouse_name} on {formatDate(transfer.created_at)}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={transfer.status} />
                <span className="text-sm text-muted-foreground">
                  Declared value {formatCurrency(Number(transfer.total_value), currency)}
                </span>
              </div>
              {transfer.notes && (
                <p className="rounded-md bg-muted/50 p-3 text-sm">{transfer.notes}</p>
              )}

              <div className="space-y-4">
                {items.map((it) => (
                  <div key={it.id} className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{it.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(Number(it.quantity), 2)} {it.unit ?? ""} @{" "}
                        {formatCurrency(Number(it.unit_cost), currency)}
                      </p>
                    </div>
                    {it.product_sku && (
                      <p className="text-xs text-muted-foreground">SKU {it.product_sku}</p>
                    )}
                    {pending ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="min-w-0">
                          <Label className="text-xs">Matching product in your catalog</Label>
                          <div className="mt-1.5">
                            <SearchableSelect
                              options={products.map((p) => ({
                                value: p.id,
                                label: p.name,
                                hint: p.sku ?? undefined,
                              }))}
                              value={state[it.id]?.dest}
                              onChange={(v) =>
                                setState((s) => ({
                                  ...s,
                                  [it.id]: { ...(s[it.id] ?? { qty: "0", reason: "" }), dest: v },
                                }))
                              }
                              placeholder="Search your products"
                            />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <Label className="text-xs">Quantity received</Label>
                          <Input
                            className="mt-1.5"
                            type="number"
                            step="any"
                            min="0"
                            max={Number(it.quantity)}
                            inputMode="decimal"
                            value={state[it.id]?.qty ?? ""}
                            onChange={(e) =>
                              setState((s) => ({
                                ...s,
                                [it.id]: {
                                  ...(s[it.id] ?? { reason: "" }),
                                  qty: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        {Number(state[it.id]?.qty ?? 0) < Number(it.quantity) && (
                          <div className="sm:col-span-2">
                            <Label className="text-xs">Discrepancy reason</Label>
                            <Input
                              className="mt-1.5"
                              value={state[it.id]?.reason ?? ""}
                              onChange={(e) =>
                                setState((s) => ({
                                  ...s,
                                  [it.id]: {
                                    ...(s[it.id] ?? { qty: "0" }),
                                    reason: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Short delivery, damaged units, ..."
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Received {formatNumber(Number(it.received_quantity ?? 0), 2)}
                        {it.discrepancy_reason ? ` · ${it.discrepancy_reason}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {pending && rejecting && (
                <div>
                  <Label className="text-xs">Rejection reason</Label>
                  <Textarea
                    className="mt-1.5"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why is this transfer being rejected?"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              {pending ? (
                rejecting ? (
                  <>
                    <Button variant="outline" onClick={() => setRejecting(false)}>
                      Back
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={reject.isPending || !canWrite}
                      onClick={() => reject.mutate()}
                    >
                      {reject.isPending ? "Rejecting..." : "Confirm rejection"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setRejecting(true)}>
                      Reject
                    </Button>
                    <Button
                      disabled={receive.isPending || !canWrite}
                      onClick={() => receive.mutate()}
                    >
                      {receive.isPending ? "Receiving..." : "Confirm & receive"}
                    </Button>
                  </>
                )
              ) : (
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
