import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { useProductBom } from "@/components/product-bom-section";
import { useProductVariants } from "@/components/product-variants-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useBusiness } from "@/lib/business-context";
import { db, type Row } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { INVENTORY_MODELS, UNIT_OPTION_GROUPS } from "@/lib/business-config";

const columns: Column[] = [
  {
    key: "image_url",
    label: "Photo",
    format: "image",
  },
  {
    key: "name",
    label: "Product",
  },
  {
    key: "sku",
    label: "SKU",
  },
  {
    key: "brand",
    label: "Brand",
  },
  {
    key: "cost_price",
    label: "Cost",
    format: "currency",
  },
  {
    key: "selling_price",
    label: "Price",
    format: "currency",
  },
  {
    key: "stock",
    label: "Stock",
    format: "number",
  },
  {
    key: "reorder_level",
    label: "Reorder",
    format: "number",
  },
  {
    key: "expiration_date",
    label: "Expires",
    format: "date",
  },
  {
    key: "status",
    label: "Status",
    format: "badge",
  },
];

const fields: Field[] = [
  {
    key: "name",
    label: "Product name",
    type: "text",
    required: true,
  },
  {
    key: "inventory_model",
    label: "Product behaviour",
    type: "select",
    options: INVENTORY_MODELS,
    default: "stocked_item",
  },
  {
    key: "sku",
    label: "SKU",
    type: "text",
  },
  {
    key: "barcode",
    label: "Barcode",
    type: "text",
  },
  {
    key: "category_id",
    label: "Category",
    type: "relation",
    relation: {
      table: "categories",
    },
  },
  {
    key: "supplier_id",
    label: "Supplier",
    type: "relation",
    relation: {
      table: "suppliers",
    },
  },
  {
    key: "brand",
    label: "Brand",
    type: "text",
  },
  {
    key: "unit",
    label: "Unit",
    type: "select",
    optionGroups: UNIT_OPTION_GROUPS,
    searchable: true,
    default: "pcs",
  },
  {
    key: "cost_price",
    label: "Cost price",
    type: "number",
    default: 0,
  },
  {
    key: "selling_price",
    label: "Selling price",
    type: "number",
    default: 0,
  },
  {
    key: "tax_rate",
    label: "Tax rate (%)",
    type: "number",
    default: 0,
  },
  {
    key: "standard_cost",
    label: "Standard cost",
    type: "number",
    default: 0,
  },
  {
    key: "reorder_level",
    label: "Reorder level",
    type: "number",
    default: 0,
  },
  {
    key: "min_stock",
    label: "Minimum stock",
    type: "number",
    default: 0,
  },
  {
    key: "max_stock",
    label: "Maximum stock",
    type: "number",
  },
  { key: "reorder_quantity", label: "Reorder quantity", type: "number" },
  { key: "internal_ref", label: "Internal reference", type: "text" },
  { key: "wholesale_price", label: "Wholesale price", type: "number" },
  { key: "weight", label: "Weight", type: "number" },
  { key: "supplier_item_code", label: "Supplier item code", type: "text" },
  { key: "bin_location", label: "Bin / zone location", type: "text" },
  { key: "price_includes_tax", label: "Price includes tax", type: "boolean", default: false },
  { key: "is_sellable", label: "Sellable", type: "boolean", default: true },
  { key: "is_purchasable", label: "Purchasable", type: "boolean", default: true },
  {
    key: "batch_number",
    label: "Batch number",
    type: "text",
  },
  {
    key: "serial_number",
    label: "Serial number",
    type: "text",
  },
  {
    key: "expiration_date",
    label: "Expiration date",
    type: "date",
  },
  {
    key: "image_url",
    label: "Product image",
    type: "image",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["active", "inactive", "discontinued"],
    default: "active",
  },
  {
    key: "description",
    label: "Description",
    type: "textarea",
  },
];

const description = "Your catalog. The form shows only the fields your business actually uses.";

/** Product form + table adapt to the business configuration from the setup wizard. */
function ProductsPage() {
  const { capability, feature, settings, businessId, currency } = useBusiness();
  const bom = useProductBom(businessId, currency);
  const variants = useProductVariants(businessId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const variantsEnabled = feature("track_variants");

  /** Variant count + aggregate stock per parent product for the listing. */
  const { data: variantSummary = {} } = useQuery({
    queryKey: ["product-variant-summary", businessId],
    enabled: !!businessId && variantsEnabled,
    queryFn: async () => {
      const { data } = await db
        .from("product_variants")
        .select("product_id,stock,status,cost_price,selling_price")
        .eq("business_id", businessId);
      const map: Record<string, { count: number; stock: number; cost: number[]; price: number[] }> =
        {};
      for (const v of (data ?? []) as Row[]) {
        if (String(v.status) === "archived") continue;
        const pid = String(v.product_id);
        map[pid] ??= { count: 0, stock: 0, cost: [], price: [] };
        map[pid].count += 1;
        map[pid].stock += Number(v.stock ?? 0);
        map[pid].cost.push(Number(v.cost_price ?? 0));
        map[pid].price.push(Number(v.selling_price ?? 0));
      }
      return map;
    },
  });

  const keep = (key: string) => {
    switch (key) {
      case "sku":
      case "barcode":
      case "brand":
        return capability(key as never);
      case "cost_price":
        return capability("cost_price" as never) && feature("track_cost");
      case "selling_price":
        return capability("selling_price" as never) && feature("enable_sales");
      case "reorder_level":
        return capability("reorder_level" as never) && feature("enable_low_stock_alerts");
      case "stock":
      case "min_stock":
      case "max_stock":
        return feature("track_quantity");
      case "standard_cost":
        return feature("track_cost") && settings.costing_method === "standard";
      case "batch_number":
        return feature("track_batch");
      case "serial_number":
        return feature("track_serial");
      case "expiration_date":
        return feature("track_expiry");
      case "supplier_id":
        return feature("enable_purchasing");
      case "unit":
        return feature("enable_unit_conversion") || feature("track_quantity");
      default:
        return true;
    }
  };

  const isFinished = (form: Row) => form.inventory_model === "finished_product";

  const formFields = fields
    .filter((f) => keep(f.key))
    .map((field): Field => {
      if (field.key === "cost_price") {
        return {
          ...field,
          label: "Cost price",
          render: ({ form, setForm }) =>
            isFinished(form) ? (
              <div>
                <Input value={Number(form.cost_price ?? 0).toFixed(2)} readOnly disabled />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Auto-calculated from components
                </p>
              </div>
            ) : (
              <Input
                type="number"
                step="any"
                value={form.cost_price ?? ""}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              />
            ),
        };
      }
      if (field.key === "selling_price") {
        return {
          ...field,
          render: ({ form, setForm }) => {
            const price = Number(form.selling_price ?? 0);
            const cost = Number(form.cost_price ?? 0);
            const margin = price > 0 ? ((price - cost) / price) * 100 : null;
            return (
              <div>
                <Input
                  type="number"
                  step="any"
                  value={form.selling_price ?? ""}
                  onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {margin === null ? "Margin: —" : `Margin: ${margin.toFixed(0)}%`}
                </p>
              </div>
            );
          },
        };
      }
      return field;
    });

  return (
    <ResourcePage
      table="products"
      title="Products"
      description={description}
      columns={[
        ...columns
          .filter((c) => keep(c.key))
          .map((c): Column =>
            (c.key === "cost_price" || c.key === "selling_price") && variantsEnabled
              ? {
                  ...c,
                  // Variant products: the variant values are authoritative; the
                  // parent value is only a default, so show the variant range.
                  render: (row) => {
                    const s = variantSummary[row.id];
                    const fmt = (n: number) => formatCurrency(n, currency);
                    if (!s?.count) return fmt(Number(row[c.key] ?? 0));
                    const list = c.key === "cost_price" ? s.cost : s.price;
                    const lo = Math.min(...list);
                    const hi = Math.max(...list);
                    return (
                      <span className="tabular-nums">
                        {lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`}
                      </span>
                    );
                  },
                }
              : c.key === "stock" && variantsEnabled
                ? {
                    ...c,
                    render: (row) => {
                      const summary = variantSummary[row.id];
                      const qty = summary?.count ? summary.stock : Number(row.stock ?? 0);
                      return (
                        <span className="tabular-nums">
                          {qty}
                          {summary?.count ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              (derived)
                            </span>
                          ) : null}
                        </span>
                      );
                    },
                  }
                : c,
          ),
        ...(variantsEnabled
          ? [
              {
                key: "variant_count",
                label: "Variants",
                render: (row: Row) => {
                  const count = variantSummary[row.id]?.count ?? 0;
                  return count ? (
                    <Badge variant="secondary">{count}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  );
                },
              } as Column,
            ]
          : []),
      ]}
      fields={formFields}
      searchKeys={["name", "sku", "barcode", "brand"]}
      orderBy="created_at"
      illustration="inventory"
      steps={[
        {
          title: "Basics",
          description: "What is this product and how should it behave?",
          fields: [
            "name",
            "inventory_model",
            "sku",
            "internal_ref",
            "barcode",
            "category_id",
            "brand",
            "unit",
            "status",
            "is_sellable",
            "is_purchasable",
          ],
        },
        {
          title: "Pricing",
          description:
            "Cost, price and tax. With variants on, these are defaults only — actual price/stock is set per variant.",
          fields: [
            "cost_price",
            "selling_price",
            "wholesale_price",
            "tax_rate",
            "price_includes_tax",
            "standard_cost",
          ],
        },
        {
          title: "Stock",
          description:
            "Reorder rules and tracking. With variants on, these are defaults for new variant rows.",
          fields: [
            "supplier_id",
            "supplier_item_code",
            "weight",
            "bin_location",
            "reorder_level",
            "reorder_quantity",
            "min_stock",
            "max_stock",
            "batch_number",
            "serial_number",
            "expiration_date",
          ],
        },
        {
          title: "Media",
          description: "Photo and description shoppers and staff will see.",
          fields: ["image_url", "description"],
        },
      ]}
      onOpenForm={(row) => {
        setEditingId(row?.id ?? null);
        void bom.load(row);
        void variants.load(row);
      }}
      formExtrasAfter="cost_price"
      formExtras={({ form, setForm }) => (
        <>
          {isFinished(form) ? (
            <bom.Section
              productName={String(form.name ?? "")}
              excludeProductId={editingId}
              onCostChange={(cost) => setForm({ ...form, cost_price: Number(cost.toFixed(4)) })}
            />
          ) : null}
          {variantsEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <Label className="text-xs font-semibold">This product has variants</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Stock, SKU, cost and selling price are tracked per variant. The product cost and
                    price above are only defaults for new variants.
                  </p>
                </div>
                <Switch
                  checked={!!form.has_variants}
                  onCheckedChange={(v) =>
                    setForm({ ...form, has_variants: v, product_type: v ? "variant" : "standard" })
                  }
                />
              </div>
              {form.has_variants ? (
                <variants.Section
                  parentCost={Number(form.cost_price ?? 0)}
                  parentPrice={Number(form.selling_price ?? 0)}
                  parentSku={String(form.sku ?? "")}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}
      validate={({ form }) =>
        (isFinished(form) ? bom.validate() : null) ??
        (variantsEnabled && form.has_variants ? variants.validate() : null)
      }
      afterSave={async ({ form, id }) => {
        if (isFinished(form)) await bom.persist(id, String(form.name ?? ""));
        if (variantsEnabled && form.has_variants) await variants.persist(id);
      }}
      rowActions={(row) => (
        <Button asChild variant="ghost" size="icon" title="View details">
          <Link to="/products/$productId" params={{ productId: row.id }}>
            <Eye className="size-4" />
          </Link>
        </Button>
      )}
    />
  );
}

export const Route = createFileRoute("/_authenticated/_shell/products")({
  head: () => ({
    meta: [
      { title: "Products — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Products — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});
