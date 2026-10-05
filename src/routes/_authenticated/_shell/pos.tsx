/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search, Trash2, Pause, Play, Percent, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, todayISO } from "@/lib/format";
import { printReceipt } from "@/lib/receipt";
import {
  completeSale,
  createSale,
  fetchAvailability,
  orderTotals,
  recordPayment,
  resolvePrice,
  stockLabel,
  round2,
  type CartLine,
} from "@/lib/sales";
import {
  fetchAddonGroups,
  fetchAddonLinks,
  RULE_LABEL,
  type AddonGroup,
  type ChosenAddon,
} from "@/lib/addons";
import { useComponentOptions } from "@/components/made-from-section";
import { optionCost } from "@/components/addon-groups-section";
import { PageHeader } from "@/components/page-header";
import { ImageThumb } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

type PayLine = { method: string; amount: number; tendered?: number };

/** Items that hold their own stock; made-when-sold items, services and non-stock items do not. */
function isStocked(p: Row) {
  if (["service", "non_stock", "digital", "non_stocked_item"].includes(p.inventory_model ?? ""))
    return false;
  return p.track_stock !== false;
}

function POSPage() {
  const { businessId, business, currency, canWrite, userId, settings, role } = useBusiness();
  const queryClient = useQueryClient();

  const [locationId, setLocationId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [category, setCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [orderDiscountType, setOrderDiscountType] = useState<"amount" | "percent">("amount");
  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [variantFor, setVariantFor] = useState<Row | null>(null);
  const [addonFor, setAddonFor] = useState<{ product: Row; variant: Row | null } | null>(null);
  const [addonPick, setAddonPick] = useState<Record<string, string[]>>({});
  const [payments, setPayments] = useState<PayLine[]>([{ method: "cash", amount: 0, tendered: 0 }]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const taxInclusive = !!settings.tax_inclusive;
  const defaultTaxRate = Number(settings.tax_rate ?? 0);
  const allowNegative = !!settings.allow_negative_stock;
  const methods = (settings.payment_methods as string[] | undefined) ?? ["cash", "card"];
  const discountLimit = Number(settings.discount_limit_percent ?? 100);
  const canOverrideDiscount = role === "owner" || role === "admin" || role === "manager";

  const { data: locations = [] } = useQuery({
    queryKey: ["pos-locations", businessId],
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

  useEffect(() => {
    if (!locationId && locations.length) {
      setLocationId((locations.find((l) => l.is_default) ?? locations[0]).id);
    }
  }, [locations, locationId]);

  const { data: register } = useQuery({
    queryKey: ["pos-register", businessId, userId, locationId],
    enabled: !!businessId && !!userId && !!settings.enable_cash_register,
    queryFn: async () => {
      const { data } = await db
        .from("cash_registers")
        .select("*")
        .eq("business_id", businessId)
        .eq("status", "open")
        .eq("assigned_user", userId)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as Row | null;
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["pos-products", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select(
          "id,name,sku,barcode,selling_price,cost_price,tax_rate,image_url,category_id,reorder_level,has_variants,inventory_model,track_stock,unit,status,product_variants(id,name,sku,barcode,selling_price,cost_price,status)",
        )
        .eq("business_id", businessId)
        .neq("status", "discontinued")
        .order("name")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: addonGroups = [] } = useQuery({
    queryKey: ["addon-groups", businessId],
    enabled: !!businessId,
    queryFn: () => fetchAddonGroups(businessId!),
  });
  const { data: addonLinks = {} } = useQuery({
    queryKey: ["addon-links", businessId],
    enabled: !!businessId,
    queryFn: () => fetchAddonLinks(businessId!),
  });
  const { data: componentCatalog = [] } = useComponentOptions(businessId);
  const groupsFor = (productId: string) =>
    (addonLinks[productId] ?? [])
      .map((id) => addonGroups.find((g) => g.id === id))
      .filter((g): g is AddonGroup => !!g && g.options.length > 0);

  const { data: categories = [] } = useQuery({
    queryKey: ["pos-categories", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("categories")
        .select("id,name")
        .eq("business_id", businessId)
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("customers")
        .select("id,name,type,price_tier,credit_limit,balance,is_walk_in,status")
        .eq("business_id", businessId)
        .neq("status", "blocked")
        .order("name");
      return (data ?? []) as Row[];
    },
  });

  const { data: priceLists = [] } = useQuery({
    queryKey: ["pos-price-lists", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db.from("price_lists").select("*").eq("business_id", businessId);
      return (data ?? []) as Row[];
    },
  });

  const { data: availability } = useQuery({
    queryKey: ["pos-availability", businessId, locationId],
    enabled: !!businessId,
    queryFn: () => fetchAvailability(businessId!, locationId || null),
  });

  const { data: held = [] } = useQuery({
    queryKey: ["held-orders", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data } = await db
        .from("held_orders")
        .select("*")
        .eq("business_id", businessId)
        .eq("status", "held")
        .order("created_at", { ascending: false });
      return (data ?? []) as Row[];
    },
  });

  // A reusable walk-in customer means the cashier never has to create one.
  const walkIn = useMemo(() => customers.find((c) => c.is_walk_in), [customers]);
  const customer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? walkIn ?? null,
    [customers, customerId, walkIn],
  );

  const ensureWalkIn = useMutation({
    mutationFn: async () => {
      const { data, error } = await db
        .from("customers")
        .insert({
          business_id: businessId,
          name: "Walk-in Customer",
          type: "walk_in",
          is_walk_in: true,
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Row;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-customers", businessId] }),
  });

  useEffect(() => {
    if (
      businessId &&
      customers.length >= 0 &&
      !walkIn &&
      !ensureWalkIn.isPending &&
      customers.length > 0
    ) {
      ensureWalkIn.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, walkIn, customers.length]);

  const avail = (productId: string, variantId?: string | null) =>
    availability ? availability.get(productId, variantId).available : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category_id !== category) return false;
      if (!q) return true;
      const variants = (p.product_variants ?? []) as Row[];
      return (
        String(p.name).toLowerCase().includes(q) ||
        String(p.sku ?? "")
          .toLowerCase()
          .includes(q) ||
        String(p.barcode ?? "")
          .toLowerCase()
          .includes(q) ||
        variants.some(
          (v) =>
            String(v.name ?? "")
              .toLowerCase()
              .includes(q) ||
            String(v.sku ?? "")
              .toLowerCase()
              .includes(q) ||
            String(v.barcode ?? "")
              .toLowerCase()
              .includes(q),
        )
      );
    });
  }, [products, search, category]);

  const totals = orderTotals(cart, {
    taxInclusive,
    orderDiscount,
    orderDiscountType,
  });

  function openAddons(product: Row, variant: Row | null) {
    // Single-choice groups preselect their first option.
    const pick: Record<string, string[]> = {};
    for (const g of groupsFor(product.id))
      pick[g.id] = g.rule === "pick_any" ? [] : [g.options[0].id!];
    setAddonPick(pick);
    setAddonFor({ product, variant });
  }

  function addToCart(product: Row, variant?: Row | null, addons?: ChosenAddon[]) {
    if (product.has_variants && !variant) {
      setVariantFor(product);
      return;
    }
    if (!addons && groupsFor(product.id).length) {
      setVariantFor(null);
      openAddons(product, variant ?? null);
      return;
    }
    const chosen = addons ?? [];
    const key = `${product.id}::${variant?.id ?? ""}::${chosen
      .map((a) => a.option_id)
      .sort()
      .join(",")}`;
    const stock = avail(product.id, variant?.id ?? null);
    const stocked = isStocked(product);
    const existing = cart.find((c) => c.key === key);
    const nextQty = (existing?.quantity ?? 0) + 1;
    if (stocked && settings.track_quantity && !allowNegative && nextQty > stock) {
      toast.error("Insufficient stock", {
        description: `${product.name}: ${stock} available at this location.`,
      });
      return;
    }
    if (existing) {
      setCart((c) => c.map((l) => (l.key === key ? { ...l, quantity: nextQty } : l)));
    } else {
      const price = resolvePrice(product, variant, customer, priceLists, 1);
      setCart((c) => [
        ...c,
        {
          key,
          product_id: product.id,
          variant_id: variant?.id ?? null,
          product_name:
            (variant ? `${product.name} — ${variant.name}` : product.name) +
            (chosen.length ? ` (${chosen.map((a) => a.option_name).join(", ")})` : ""),
          sku: variant?.sku ?? product.sku,
          unit: product.unit,
          quantity: 1,
          unit_price: round2(price + chosen.reduce((t, a) => t + a.extra_price, 0)),
          unit_cost:
            Number(variant?.cost_price ?? product.cost_price ?? 0) +
            chosen.reduce((t, a) => t + a.extra_cost, 0),
          addons: chosen,
          discount: 0,
          discount_type: "amount",
          tax_rate: Number(product.tax_rate ?? defaultTaxRate),
          available: stock,
        },
      ]);
    }
    setVariantFor(null);
    setAddonFor(null);
  }

  function confirmAddons() {
    if (!addonFor) return;
    const chosen: ChosenAddon[] = [];
    for (const g of groupsFor(addonFor.product.id)) {
      const ids = addonPick[g.id] ?? [];
      if (g.rule === "pick1_required" && !ids.length) {
        toast.error(`Choose a ${g.name}`);
        return;
      }
      for (const id of ids) {
        const o = g.options.find((x) => x.id === id);
        if (o)
          chosen.push({
            option_id: id,
            group_name: g.name,
            option_name: o.name,
            extra_price: Number(o.extra_price || 0),
            extra_cost: round2(optionCost(o, componentCatalog)),
          });
      }
    }
    addToCart(addonFor.product, addonFor.variant, chosen);
  }

  function setQty(key: string, qty: number) {
    if (qty <= 0) {
      setCart((c) => c.filter((l) => l.key !== key));
      return;
    }
    const line = cart.find((l) => l.key === key);
    const lineProduct = line ? products.find((p) => p.id === line.product_id) : null;
    if (
      line &&
      lineProduct &&
      isStocked(lineProduct) &&
      settings.track_quantity &&
      !allowNegative
    ) {
      const stock = avail(line.product_id, line.variant_id);
      if (qty > stock) {
        toast.error("Insufficient stock", { description: `Only ${stock} available.` });
        return;
      }
    }
    setCart((c) => c.map((l) => (l.key === key ? { ...l, quantity: qty } : l)));
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    for (const p of products) {
      const variants = (p.product_variants ?? []) as Row[];
      const v = variants.find(
        (x) =>
          String(x.barcode ?? "").toLowerCase() === q || String(x.sku ?? "").toLowerCase() === q,
      );
      if (v) {
        addToCart(p, v);
        setSearch("");
        return;
      }
      if (String(p.barcode ?? "").toLowerCase() === q || String(p.sku ?? "").toLowerCase() === q) {
        addToCart(p);
        setSearch("");
        return;
      }
    }
    if (filtered.length === 1) {
      addToCart(filtered[0]);
      setSearch("");
    }
  }

  const openRegister = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("cash_registers").insert({
        business_id: businessId,
        location_id: locationId || null,
        name: `Till — ${new Date().toLocaleDateString()}`,
        assigned_user: userId,
        opening_cash: openingCash,
        status: "open",
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRegisterOpen(false);
      toast.success("Register opened");
      queryClient.invalidateQueries({ queryKey: ["pos-register"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const hold = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error("Cart is empty");
      const { error } = await db.from("held_orders").insert({
        business_id: businessId,
        location_id: locationId || null,
        register_id: register?.id ?? null,
        customer_id: customerId || walkIn?.id || null,
        label: `${cart.length} item(s) · ${formatCurrency(totals.total, currency)}`,
        cart: cart as any,
        meta: { orderDiscount, orderDiscountType },
        held_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCart([]);
      setOrderDiscount(0);
      toast.success("Order held");
      queryClient.invalidateQueries({ queryKey: ["held-orders", businessId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resume = useMutation({
    mutationFn: async (order: Row) => {
      if (order.held_by && order.held_by !== userId) {
        throw new Error("This order was suspended by another cashier.");
      }
      await db.from("held_orders").update({ status: "resumed" }).eq("id", order.id);
      return order;
    },
    onSuccess: (order) => {
      setCart((order.cart ?? []) as CartLine[]);
      setCustomerId(order.customer_id ?? "");
      setOrderDiscount(Number(order.meta?.orderDiscount ?? 0));
      setOrderDiscountType(order.meta?.orderDiscountType ?? "amount");
      setHeldOpen(false);
      queryClient.invalidateQueries({ queryKey: ["held-orders", businessId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const paidTotal = round2(payments.reduce((s, p) => s + Number(p.amount || 0), 0));
  const balance = round2(totals.total - paidTotal);

  const checkout = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error("Cart is empty");
      const valid = payments.filter((p) => Number(p.amount) > 0);
      if (paidTotal > totals.total + 0.009) throw new Error("Payments exceed the sale total");
      if (balance > 0.009 && !customerId && !walkIn?.id)
        throw new Error("Select a customer for the unpaid balance");

      const sale = await createSale({
        businessId: businessId!,
        documentType: "pos_sale",
        customerId: customerId || walkIn?.id || null,
        locationId: locationId || null,
        registerId: register?.id ?? null,
        channel: "pos",
        source: "pos",
        currency,
        taxInclusive,
        saleDate: todayISO(),
        status: "draft",
        orderDiscount,
        orderDiscountType,
        salespersonId: userId,
        createdBy: userId,
        lines: cart,
      });

      for (const p of valid) {
        await recordPayment({
          businessId: businessId!,
          saleId: sale.id,
          registerId: register?.id ?? null,
          method: p.method,
          amount: Number(p.amount),
          tendered: p.tendered ?? null,
          createdBy: userId,
        });
      }

      await completeSale(sale.id);

      const { data: fresh } = await db.from("sales").select("*").eq("id", sale.id).single();
      const { data: items } = await db.from("sale_items").select("*").eq("sale_id", sale.id);
      return { sale: (fresh ?? sale) as Row, items: (items ?? []) as Row[], payments: valid };
    },
    onSuccess: ({ sale, items, payments: paid }) => {
      printReceipt({
        business,
        sale,
        items,
        payments: paid as any,
        customer,
        cashier: null,
        currency,
        taxName: settings.tax_name ?? "Tax",
      });
      toast.success(`Sale ${sale.sale_number} completed`);
      setCart([]);
      setPayments([{ method: "cash", amount: 0, tendered: 0 }]);
      setOrderDiscount(0);
      setPayOpen(false);
      queryClient.invalidateQueries({ queryKey: ["pos-availability"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      searchRef.current?.focus();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not complete the sale"),
  });

  if (!canWrite) {
    return (
      <div className="space-y-6">
        <PageHeader title="Point of Sale" description="Your role cannot record sales." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!online && (
        <div role="status" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          You're offline. Sales can't be saved until the internet is back — keep this page open and charge again once it reconnects.
        </div>
      )}
      <PageHeader
        title="Point of Sale"
        description="Scan or search, take payment, print the receipt. Stock leaves through the inventory ledger."
        actions={
          <div className="flex items-center gap-2">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-44">
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
            <Button variant="outline" onClick={() => setHeldOpen(true)}>
              <Play className="size-4" /> Held ({held.length})
            </Button>
          </div>
        }
      />

      {settings.enable_cash_register && !register && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            No register is open for you. Open one to track cash for this shift.
          </p>
          <Button onClick={() => setRegisterOpen(true)}>Open register</Button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* -------------------------------------------------- catalogue */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Scan a barcode or search name / SKU / variant…"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={category === "all" ? "default" : "outline"}
              onClick={() => setCategory("all")}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={category === c.id ? "default" : "outline"}
                onClick={() => setCategory(c.id)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          <ScrollArea className="h-[calc(100vh-320px)] min-h-64 rounded-xl border p-3">
            {isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Loading products…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No products match your search.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => {
                  const stock = avail(p.id);
                  const tone = stockLabel(stock, Number(p.reorder_level ?? 0));
                  const stocked = isStocked(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addToCart(p)}
                      className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm"
                    >
                      <div className="aspect-square w-full overflow-hidden rounded-md bg-muted">
                        {p.image_url ? (
                          <ImageThumb value={p.image_url} alt={p.name} className="size-full" />
                        ) : (
                          <div className="grid size-full place-items-center text-xs text-muted-foreground">
                            {String(p.name).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
                      <span className="text-sm font-semibold">
                        {formatCurrency(Number(p.selling_price ?? 0), currency)}
                      </span>
                      {stocked && settings.track_quantity && (
                        <Badge variant={tone.tone} className="w-fit text-[10px]">
                          {tone.label} · {stock}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* -------------------------------------------------------- cart */}
        <Card className="flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            <Select value={customerId || walkIn?.id || ""} onValueChange={setCustomerId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Walk-in customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.is_walk_in ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <ScrollArea className="max-h-[38vh] min-h-24 pr-2">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Cart is empty.</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((l) => (
                  <li key={l.key} className="rounded-lg border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(l.unit_price, currency)} each
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => setQty(l.key, 0)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setQty(l.key, l.quantity - 1)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <Input
                        className="h-8 w-16 text-center"
                        type="number"
                        value={l.quantity}
                        onChange={(e) => setQty(l.key, Number(e.target.value))}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setQty(l.key, l.quantity + 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                      <span className="flex-1 text-right text-sm font-semibold">
                        {formatCurrency(
                          l.quantity * l.unit_price - Number(l.discount || 0),
                          currency,
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>

          <Separator />

          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(totals.subtotal, currency)} />
            <Row label="Discount" value={`-${formatCurrency(totals.discount, currency)}`} />
            <Row
              label={`${settings.tax_name ?? "Tax"}${taxInclusive ? " (incl.)" : ""}`}
              value={formatCurrency(totals.tax, currency)}
            />
            <div className="flex items-center justify-between border-t pt-2 text-lg font-semibold">
              <span>Total</span>
              <span>{formatCurrency(totals.total, currency)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => hold.mutate()} disabled={!cart.length}>
              <Pause className="size-4" /> Hold
            </Button>
            <Button variant="outline" onClick={() => setDiscountOpen(true)} disabled={!cart.length}>
              <Percent className="size-4" /> Discount
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCart([]);
                setOrderDiscount(0);
              }}
              disabled={!cart.length}
            >
              <X className="size-4" /> Clear
            </Button>
          </div>
          <Button
            size="lg"
            disabled={!cart.length}
            onClick={() => {
              setPayments([
                { method: methods[0] ?? "cash", amount: totals.total, tendered: totals.total },
              ]);
              setPayOpen(true);
            }}
          >
            Pay {formatCurrency(totals.total, currency)}
          </Button>
        </Card>
      </div>

      {/* ------------------------------------------------ variant picker */}
      <Dialog open={!!variantFor} onOpenChange={(o) => !o && setVariantFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a variant</DialogTitle>
            <DialogDescription>{variantFor?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {((variantFor?.product_variants ?? []) as Row[]).map((v) => {
              const stock = avail(variantFor!.id, v.id);
              return (
                <Button
                  key={v.id}
                  variant="outline"
                  className="h-auto flex-col items-start gap-1 py-3"
                  onClick={() => addToCart(variantFor!, v)}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(
                      Number(v.selling_price ?? variantFor?.selling_price ?? 0),
                      currency,
                    )}{" "}
                    · {stock} available
                  </span>
                </Button>
              );
            })}
            {!((variantFor?.product_variants ?? []) as Row[]).length && (
              <p className="text-sm text-muted-foreground">
                No variants defined for this product yet.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- add-on chooser */}
      <Dialog open={!!addonFor} onOpenChange={(o) => !o && setAddonFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{addonFor?.product.name}</DialogTitle>
            <DialogDescription>Choose options for this item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {addonFor &&
              groupsFor(addonFor.product.id).map((g) => (
                <div key={g.id} className="space-y-2">
                  <p className="text-sm font-medium">
                    {g.name}{" "}
                    <span className="text-xs text-muted-foreground">{RULE_LABEL[g.rule]}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {g.options.map((o) => {
                      const on = (addonPick[g.id] ?? []).includes(o.id!);
                      return (
                        <Button
                          key={o.id}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          aria-pressed={on}
                          onClick={() =>
                            setAddonPick((cur) => {
                              const ids = cur[g.id] ?? [];
                              const next =
                                g.rule === "pick_any"
                                  ? on
                                    ? ids.filter((x) => x !== o.id)
                                    : [...ids, o.id!]
                                  : on && g.rule === "pick1_optional"
                                    ? []
                                    : [o.id!];
                              return { ...cur, [g.id]: next };
                            })
                          }
                        >
                          {o.name}
                          {Number(o.extra_price) > 0 &&
                            ` +${formatCurrency(Number(o.extra_price), currency)}`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddonFor(null)}>
              Cancel
            </Button>
            <Button onClick={confirmAddons}>Add to order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- order discount */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order discount</DialogTitle>
            <DialogDescription>
              Discounts above {discountLimit}% need a manager. You are signed in as {role}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={orderDiscountType}
                onValueChange={(v) => setOrderDiscountType(v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amount">Fixed amount</SelectItem>
                  <SelectItem value="percent">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Value</Label>
              <Input
                type="number"
                value={orderDiscount}
                onChange={(e) => setOrderDiscount(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                const pct =
                  orderDiscountType === "percent"
                    ? orderDiscount
                    : totals.subtotal > 0
                      ? (orderDiscount / totals.subtotal) * 100
                      : 0;
                if (pct > discountLimit && !canOverrideDiscount) {
                  toast.error("Manager authorization required for this discount");
                  return;
                }
                setDiscountOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------------- payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Take payment</DialogTitle>
            <DialogDescription>
              Total {formatCurrency(totals.total, currency)}. Split across as many methods as you
              need.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {payments.map((p, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={p.method}
                    onValueChange={(v) =>
                      setPayments((list) =>
                        list.map((x, i) => (i === idx ? { ...x, method: v } : x)),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    value={p.amount}
                    onChange={(e) =>
                      setPayments((list) =>
                        list.map((x, i) =>
                          i === idx ? { ...x, amount: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tendered</Label>
                  <Input
                    type="number"
                    value={p.tendered ?? ""}
                    onChange={(e) =>
                      setPayments((list) =>
                        list.map((x, i) =>
                          i === idx ? { ...x, tendered: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPayments((list) => list.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPayments((list) => [...list, { method: methods[0] ?? "cash", amount: balance }])
              }
            >
              <Plus className="size-4" /> Add payment
            </Button>
          </div>
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <Row label="Paid" value={formatCurrency(paidTotal, currency)} />
            <Row
              label={balance > 0 ? "Balance due" : "Change"}
              value={formatCurrency(Math.abs(balance) < 0.01 ? 0 : Math.abs(balance), currency)}
            />
            <Row
              label="Status"
              value={balance <= 0.009 ? "Paid" : paidTotal > 0 ? "Partially paid" : "Unpaid"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending ? "Completing…" : "Complete sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- held orders */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Held orders</DialogTitle>
            <DialogDescription>
              Resume a suspended cart. Only the cashier who held it can resume it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {held.length === 0 && <p className="text-sm text-muted-foreground">Nothing on hold.</p>}
            {held.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{h.label ?? "Held order"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()}
                    {h.held_by && h.held_by !== userId ? " · another cashier" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resume.mutate(h)}>
                    Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await db.from("held_orders").update({ status: "cancelled" }).eq("id", h.id);
                      queryClient.invalidateQueries({ queryKey: ["held-orders", businessId] });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------- open register */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open register</DialogTitle>
            <DialogDescription>Count the opening float before your shift starts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Opening cash</Label>
            <Input
              type="number"
              value={openingCash}
              onChange={(e) => setOpeningCash(Number(e.target.value))}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => openRegister.mutate()} disabled={openRegister.isPending}>
              Open register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale — Daraven ERP" },
      {
        name: "description",
        content: "Fast counter selling with barcode search, split payments and receipts.",
      },
      { property: "og:title", content: "Point of Sale — Daraven ERP" },
      {
        property: "og:description",
        content: "Fast counter selling with barcode search, split payments and receipts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: POSPage,
});
