/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import { STATUS_LABEL, availableQuantity, movementSign, stockStatus } from "@/lib/inventory";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ProductDetail() {
  const { productId } = Route.useParams();
  const { businessId, currency, settings, feature } = useBusiness();

  const { data, isLoading } = useQuery({
    queryKey: ["product-detail", productId, businessId],
    enabled: !!businessId && !!productId,
    queryFn: async () => {
      const [product, balances, movements, variants, suppliers, costs, boms, bomItems, warehouses, batches] =
        await Promise.all([
          db.from("products").select("*").eq("id", productId).maybeSingle(),
          db.from("inventory_balances").select("*").eq("product_id", productId),
          db
            .from("inventory_movements")
            .select("*")
            .eq("product_id", productId)
            .order("created_at", { ascending: false })
            .limit(100),
          db.from("product_variants").select("*").eq("product_id", productId),
          db.from("supplier_products").select("*").eq("product_id", productId),
          db
            .from("cost_history")
            .select("*")
            .eq("product_id", productId)
            .order("created_at", { ascending: false })
            .limit(50),
          db.from("bill_of_materials").select("*").eq("product_id", productId),
          db.from("bom_items").select("*").eq("business_id", businessId),
          db.from("warehouses").select("id, name").eq("business_id", businessId),
          db.from("batches").select("*").eq("product_id", productId),
        ]);
      return {
        product: (product.data ?? null) as Row | null,
        balances: (balances.data ?? []) as Row[],
        movements: (movements.data ?? []) as Row[],
        variants: (variants.data ?? []) as Row[],
        suppliers: (suppliers.data ?? []) as Row[],
        costs: (costs.data ?? []) as Row[],
        boms: (boms.data ?? []) as Row[],
        bomItems: (bomItems.data ?? []) as Row[],
        warehouses: (warehouses.data ?? []) as Row[],
        batches: (batches.data ?? []) as Row[],
      };
    },
  });

  const { data: names } = useQuery({
    queryKey: ["product-detail-names", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [products, suppliers] = await Promise.all([
        db.from("products").select("id, name").eq("business_id", businessId),
        db.from("suppliers").select("id, name").eq("business_id", businessId),
      ]);
      return {
        products: Object.fromEntries(((products.data ?? []) as Row[]).map((p) => [p.id, p.name])),
        suppliers: Object.fromEntries(((suppliers.data ?? []) as Row[]).map((s) => [s.id, s.name])),
      };
    },
  });

  const warehouseMap = useMemo(
    () => Object.fromEntries((data?.warehouses ?? []).map((w) => [w.id, w.name])),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Product" description="Loading product details..." />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const product = data?.product;
  if (!product) {
    return (
      <div className="space-y-6">
        <PageHeader title="Product not found" description="This product no longer exists." />
        <Button asChild variant="outline">
          <Link to="/products">
            <ArrowLeft className="size-4" /> Back to products
          </Link>
        </Button>
      </div>
    );
  }

  const onHand = Number(product.stock ?? 0);
  const reserved = Number(product.reserved_stock ?? 0);
  const status = stockStatus(onHand, {
    reorderLevel: Number(product.reorder_level ?? 0),
    minStock: Number(product.min_stock ?? 0),
    maxStock: product.max_stock,
    active: product.status !== "inactive",
    rule: String(settings.low_stock_rule),
  });
  const cost = Number(product.average_cost || product.cost_price || 0);
  const isService = product.inventory_model === "service" || product.product_type === "service";

  const tabs = [
    { value: "overview", label: "Overview", show: true },
    { value: "inventory", label: "Inventory", show: !isService && feature("track_quantity") },
    { value: "pricing", label: "Pricing", show: true },
    { value: "variants", label: "Variants", show: feature("track_variants") },
    { value: "suppliers", label: "Suppliers", show: feature("enable_purchasing") },
    { value: "costs", label: "Cost History", show: feature("track_cost") },
    { value: "movements", label: "Stock Movements", show: !isService },
    { value: "bom", label: "BOM", show: feature("enable_bom") },
    { value: "batches", label: "Batches", show: feature("track_batch") || feature("track_expiry") },
  ].filter((t) => t.show);

  const bom = data?.boms?.[0];
  const components = (data?.bomItems ?? []).filter((i) => i.bom_id === bom?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={[product.sku, titleCase(String(product.inventory_model ?? product.product_type))]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/products">
              <ArrowLeft className="size-4" /> Products
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">On hand</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{formatNumber(onHand, 2)}</p>
            <Badge className="mt-2" variant={status === "out_of_stock" ? "destructive" : "secondary"}>
              {STATUS_LABEL[status]}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">
              {formatNumber(availableQuantity(onHand, reserved), 2)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(reserved, 2)} reserved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Average cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{formatCurrency(cost, currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{titleCase(String(settings.costing_method))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Inventory value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-semibold">{formatCurrency(onHand * cost, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="surface-panel mt-4 p-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["SKU", product.sku],
              ["Barcode", product.barcode],
              ["Brand", product.brand],
              ["Unit", product.unit],
              ["Product behaviour", titleCase(String(product.inventory_model ?? ""))],
              ["Reorder level", formatNumber(Number(product.reorder_level ?? 0), 2)],
              ["Minimum stock", formatNumber(Number(product.min_stock ?? 0), 2)],
              ["Maximum stock", product.max_stock ? formatNumber(Number(product.max_stock), 2) : null],
              ["Status", titleCase(String(product.status ?? ""))],
              ["Created", formatDate(product.created_at)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium">{value ? String(value) : "—"}</dd>
              </div>
            ))}
          </dl>
          {product.description && (
            <p className="mt-4 text-sm text-muted-foreground">{product.description}</p>
          )}
        </TabsContent>

        <TabsContent value="inventory" className="surface-panel mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Average cost</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.balances ?? []).map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{warehouseMap[b.warehouse_id] ?? "Unassigned"}</TableCell>
                  <TableCell className="text-right">{formatNumber(Number(b.quantity ?? 0), 2)}</TableCell>
                  <TableCell className="text-right">
                    {formatNumber(Number(b.reserved_quantity ?? 0), 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(availableQuantity(b.quantity, b.reserved_quantity), 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(b.average_cost ?? 0), currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(b.quantity ?? 0) * Number(b.average_cost ?? 0), currency)}
                  </TableCell>
                </TableRow>
              ))}
              {!data?.balances.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No location balances yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="pricing" className="surface-panel mt-4 p-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Purchase cost", formatCurrency(Number(product.cost_price ?? 0), currency)],
              ["Average cost", formatCurrency(Number(product.average_cost ?? 0), currency)],
              ["Standard cost", formatCurrency(Number(product.standard_cost ?? 0), currency)],
              ["Selling price", formatCurrency(Number(product.selling_price ?? 0), currency)],
              ["Tax rate", `${formatNumber(Number(product.tax_rate ?? 0), 2)}%`],
              [
                "Margin",
                Number(product.selling_price ?? 0) > 0
                  ? `${formatNumber(((Number(product.selling_price) - cost) / Number(product.selling_price)) * 100, 1)}%`
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </TabsContent>

        <TabsContent value="variants" className="surface-panel mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.variants ?? []).map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.name}</TableCell>
                  <TableCell className="text-muted-foreground">{v.sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(v.cost_price ?? 0), currency)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(v.selling_price ?? 0), currency)}
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(Number(v.stock ?? 0), 2)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{titleCase(String(v.status ?? ""))}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!data?.variants.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No variants for this product.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="suppliers" className="surface-panel mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Supplier SKU</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Lead time</TableHead>
                <TableHead>Preferred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.suppliers ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{names?.suppliers?.[s.supplier_id] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.supplier_sku ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(s.unit_cost ?? 0), currency)}</TableCell>
                  <TableCell className="text-right">{s.lead_time_days ?? 0} days</TableCell>
                  <TableCell>
                    <Badge variant={s.is_preferred ? "default" : "secondary"}>
                      {s.is_preferred ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!data?.suppliers.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {names?.suppliers?.[product.supplier_id]
                      ? `Default supplier: ${names.suppliers[product.supplier_id]}`
                      : "No supplier links yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="costs" className="surface-panel mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Old cost</TableHead>
                <TableHead className="text-right">New cost</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.costs ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(c.created_at)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(c.old_cost ?? 0), currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(c.new_cost ?? 0), currency)}</TableCell>
                  <TableCell>{titleCase(String(c.method ?? ""))}</TableCell>
                  <TableCell className="text-muted-foreground">{titleCase(String(c.reason ?? ""))}</TableCell>
                </TableRow>
              ))}
              {!data?.costs.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No cost changes recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="movements" className="surface-panel mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.movements ?? []).map((m) => {
                const sign = movementSign(m.type);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(m.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={sign < 0 ? "destructive" : "secondary"}>{titleCase(m.type)}</Badge>
                    </TableCell>
                    <TableCell>{warehouseMap[m.warehouse_id] ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {sign < 0 ? "−" : "+"}
                      {formatNumber(Number(m.base_quantity ?? m.quantity ?? 0), 2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(m.unit_cost ?? 0), currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.reference ?? m.reason ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {!data?.movements.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No movements recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="bom" className="surface-panel mt-4 overflow-x-auto">
          {bom ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Waste %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{names?.products?.[c.component_product_id] ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(c.quantity ?? 0), 3)}</TableCell>
                    <TableCell>{c.unit ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatNumber(Number(c.waste_percent ?? 0), 2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No recipe defined for this product.</p>
          )}
        </TabsContent>

        <TabsContent value="batches" className="surface-panel mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.batches ?? []).map((b) => {
                const days = b.expiry_date
                  ? Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86400000)
                  : null;
                const alert = Number(settings.expiry_alert_days ?? 30);
                const label =
                  days === null ? "Valid" : days < 0 ? "Expired" : days <= alert ? "Expiring soon" : "Valid";
                return (
                  <TableRow key={b.id}>
                    <TableCell>{b.batch_number}</TableCell>
                    <TableCell>{b.expiry_date ? formatDate(b.expiry_date) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(Number(b.remaining_quantity ?? 0), 2)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(b.unit_cost ?? 0), currency)}</TableCell>
                    <TableCell>
                      <Badge variant={label === "Expired" ? "destructive" : "secondary"}>{label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!data?.batches.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No batches recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/products_/$productId")({
  head: () => ({
    meta: [
      { title: "Product Details — KPIOptiva" },
      {
        name: "description",
        content: "Product overview, inventory by location, pricing, variants, suppliers, cost history and stock movements.",
      },
      { property: "og:title", content: "Product Details — KPIOptiva" },
      {
        property: "og:description",
        content: "Product overview, inventory by location, pricing, variants, suppliers, cost history and stock movements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductDetail,
});
