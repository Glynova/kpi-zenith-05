import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { ItemForm, newLine } from "@/components/item-form";
import type { MadeFromLine } from "@/components/made-from-section";
import { MADE_FROM, kindOf } from "@/lib/item-kinds";
import { normalizeUnit, toStockUnit } from "@/lib/units";
import { useProductVariants } from "@/components/product-variants-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Small units whose cost above 1 per unit is usually a unit mismatch; value = the 1000× unit. */
const SMALL_UNITS: Record<string, string> = {
  g: "kg",
  gram: "kg",
  grams: "kg",
  gm: "kg",
  ml: "L",
  milliliter: "L",
  millilitre: "L",
  mg: "g",
};

/** Product form + table adapt to the business configuration from the setup wizard. */
function ProductsPage() {
  const { capability, feature, settings, businessId, currency } = useBusiness();
  const [bundleLines, setBundleLines] = useState<MadeFromLine[]>([newLine()]);
  const variants = useProductVariants(businessId);
  const [addonIds, setAddonIds] = useState<string[]>([]);
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

  const formFields: Field[] = [
    ...fields,
    { key: "item_type", label: "Item type", type: "select", default: "product" },
    { key: "item_subtype", label: "Subtype", type: "text", default: "standard_product" },
    { key: "costing_method", label: "Costing method", type: "text" },
    { key: "track_stock", label: "Track stock", type: "boolean", default: true },
    { key: "has_variants", label: "Has variants", type: "boolean", default: false },
    { key: "bundle_fixed_price", label: "Fixed bundle price", type: "boolean", default: false },
    { key: "consumption_mode", label: "Consumption mode", type: "text", default: "on_sale" },
    { key: "output_quantity", label: "Output quantity", type: "number", default: 1 },
    { key: "labor_hours", label: "Labor hours", type: "number", default: 0 },
    { key: "labor_rate", label: "Labor rate", type: "number", default: 0 },
    { key: "overhead_per_unit", label: "Overhead per unit", type: "number", default: 0 },
    { key: "service_duration_minutes", label: "Duration", type: "number" },
    { key: "commission_rate", label: "Commission", type: "number" },
    { key: "assigned_employee_id", label: "Employee", type: "text" },
    { key: "income_account", label: "Income account", type: "text" },
    { key: "requires_booking", label: "Requires booking", type: "boolean" },
    { key: "billing_unit", label: "Billing unit", type: "text" },
    { key: "default_location_id", label: "Location", type: "text" },
    { key: "image_urls", label: "Images", type: "text" },
    { key: "addon_group_ids", label: "Add-ons", type: "text", transient: true },
    {
      key: "opening_quantity",
      label: "Opening quantity",
      type: "number",
      transient: true,
      default: 0,
    },
  ];

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
                    if (!s?.count) {
                      const v = Number(row[c.key] ?? 0);
                      const last = Number(row.last_purchase_cost ?? 0);
                      return (
                        <span className="tabular-nums">
                          {fmt(v)}
                          {c.key === "cost_price" && last > 0 && Math.abs(last - v) > 0.005 && (
                            <span className="block text-xs text-muted-foreground">
                              Last paid {fmt(last)}
                            </span>
                          )}
                        </span>
                      );
                    }
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
      transformPayload={(payload, { form, editing }) => {
        const kind = String(form.item_type || "product");
        const card = kindOf(form);
        const madeFrom = MADE_FROM.includes(card);
        payload.sku =
          String(form.sku || "").trim() ||
          (editing ? null : `ITM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
        payload.barcode = kind === "service" ? null : String(form.barcode || "").trim() || null;
        payload.item_subtype =
          form.item_subtype ||
          (kind === "service"
            ? "standard_service"
            : kind === "bundle"
              ? "fixed_bundle"
              : kind === "non_stock"
                ? "non_stock_item"
                : "standard_product");
        payload.consumption_mode =
          form.consumption_mode === "on_production" ? "on_production" : "on_sale";
        payload.track_stock =
          kind === "service" || kind === "non_stock"
            ? false
            : madeFrom
              ? payload.consumption_mode === "on_production"
              : !!form.track_stock;
        payload.inventory_model =
          kind === "service"
            ? "service"
            : payload.track_stock
              ? "stocked_item"
              : "non_stocked_item";
        payload.product_type =
          kind === "service"
            ? "service"
            : kind === "bundle"
              ? "bundle"
              : kind === "non_stock"
                ? "non_stocked"
                : form.has_variants
                  ? "variant"
                  : "standard";
        payload.has_variants = card === "ready" && !!form.has_variants;
        // One alert level: "alert me below" feeds both legacy low-stock fields.
        if (form.reorder_level != null && form.reorder_level !== "")
          payload.min_stock = Number(form.reorder_level);
        payload.output_quantity =
          Number(form.output_quantity) > 0 ? Number(form.output_quantity) : 1;
        payload.labor_hours = Number(form.labor_hours || 0);
        payload.labor_rate = Number(form.labor_rate || 0);
        payload.overhead_per_unit = Number(form.overhead_per_unit || 0);
        payload.image_urls = Array.isArray(form.image_urls)
          ? form.image_urls
          : form.image_url
            ? [form.image_url]
            : [];
        payload.image_url = payload.image_urls[0] ?? null;
        payload.costing_method = madeFrom ? null : form.costing_method || null;
        return payload;
      }}
      searchKeys={["name", "sku", "barcode", "brand"]}
      orderBy="created_at"
      illustration="inventory"
      customForm={(ctx) => (
        <ItemForm
          {...ctx}
          businessId={businessId}
          currency={currency}
          variantsEnabled={variantsEnabled}
          variants={variants}
          bundleLines={bundleLines}
          setBundleLines={setBundleLines}
          defaultAddonIds={addonIds}
        />
      )}
      onOpenForm={(row) => {
        void variants.load(row);
        setBundleLines([]);
        if (row?.id) {
          void db
            .from("bundle_components")
            .select(
              "component_product_id,variant_id,quantity,entered_quantity,entered_unit,waste_percent",
            )
            .eq("bundle_product_id", row.id)
            .then(({ data }: { data: Row[] | null }) => {
              if (data?.length)
                setBundleLines(
                  data.map((x) => ({
                    key: crypto.randomUUID(),
                    productId: String(x.component_product_id),
                    variantId: x.variant_id ?? null,
                    quantity: Number(x.entered_quantity ?? x.quantity),
                    unit: String(x.entered_unit ?? ""),
                    waste: Number(x.waste_percent ?? 0),
                  })),
                );
            });
        } else setBundleLines([newLine()]);
        if (row?.id)
          void db
            .from("product_addon_groups")
            .select("group_id")
            .eq("product_id", row.id)
            .order("sort")
            .then(({ data }: { data: Row[] | null }) =>
              setAddonIds((data ?? []).map((x) => String(x.group_id))),
            );
        else setAddonIds([]);
      }}
      validate={({ form }) => {
        const kind = kindOf(form);
        const numeric = [
          "cost_price",
          "selling_price",
          "opening_quantity",
          "reorder_level",
          "reorder_quantity",
          "max_stock",
          "tax_rate",
          "service_duration_minutes",
          "commission_rate",
          "labor_hours",
          "labor_rate",
          "overhead_per_unit",
        ];
        if (
          numeric.some(
            (key) =>
              form[key] != null &&
              form[key] !== "" &&
              (!Number.isFinite(Number(form[key])) || Number(form[key]) < 0),
          )
        )
          return "Numbers cannot be negative";
        if (
          form.output_quantity != null &&
          form.output_quantity !== "" &&
          !(Number(form.output_quantity) > 0)
        )
          return "Output quantity must be more than zero";
        if (Number(form.commission_rate || 0) > 100) return "Commission cannot be over 100%";
        if (Number(form.max_stock) > 0 && Number(form.reorder_level) > Number(form.max_stock))
          return "Alert level cannot be above maximum stock";
        const filledLines = bundleLines.filter((line) => line.productId);
        if (MADE_FROM.includes(kind) && !filledLines.length)
          return "Add at least one item this is made from";
        if (filledLines.some((l) => !(Number(l.quantity) > 0)))
          return "Each component needs a quantity above zero";
        if (filledLines.some((l) => Number(l.waste) < 0 || Number(l.waste) > 100))
          return "Waste must be between 0 and 100%";
        if (kind === "ready" && form.has_variants) return variants.validate(new Set());
        return null;
      }}
      afterSave={async ({ form, id, editing }) => {
        // Opening stock must land in a real location so sales at that location can use it.
        let locationId = (form.default_location_id as string) || null;
        if (!locationId) {
          const { data: loc } = await db
            .from("warehouses")
            .select("id")
            .eq("business_id", businessId)
            .order("is_default", { ascending: false })
            .order("created_at")
            .limit(1)
            .maybeSingle();
          locationId = loc?.id ?? null;
        }
        if (form.item_type === "product" && form.has_variants && variantsEnabled)
          await variants.persist(id, locationId);
        const kind = kindOf(form);
        const usesComponents = MADE_FROM.includes(kind) || form.item_type === "service";
        const filled = bundleLines.filter((line) => line.productId);
        if (usesComponents || editing) {
          const { error: delError } = await db
            .from("bundle_components")
            .delete()
            .eq("bundle_product_id", id);
          if (delError) throw delError;
        }
        if (usesComponents && filled.length) {
          const { data: comps } = await db
            .from("products")
            .select("id,unit")
            .in(
              "id",
              filled.map((l) => l.productId),
            );
          const unitOf = new Map(
            ((comps ?? []) as Row[]).map((c) => [c.id, normalizeUnit(c.unit)]),
          );
          const { error } = await db.from("bundle_components").insert(
            filled.map((line) => {
              const stockUnit = unitOf.get(line.productId) ?? "pcs";
              const entered = line.unit || stockUnit;
              return {
                business_id: businessId,
                bundle_product_id: id,
                component_product_id: line.productId,
                variant_id: line.variantId,
                quantity:
                  toStockUnit(Number(line.quantity), entered, stockUnit) ?? Number(line.quantity),
                entered_quantity: Number(line.quantity),
                entered_unit: entered,
                waste_percent: Number(line.waste || 0),
              };
            }),
          );
          if (error) throw error;
        }
        const groupIds = (form.addon_group_ids as string[] | undefined) ?? addonIds;
        await db.from("product_addon_groups").delete().eq("product_id", id);
        if (groupIds.length) {
          const { error } = await db.from("product_addon_groups").insert(
            groupIds.map((group_id, sort) => ({
              business_id: businessId,
              product_id: id,
              group_id,
              sort,
            })),
          );
          if (error) throw error;
        }
        const qty = Number(form.opening_quantity || 0);
        if (!editing && qty > 0 && form.track_stock && !form.has_variants) {
          const cost = Number(form.cost_price || 0);
          const { error } = await db.from("inventory_movements").insert({
            business_id: businessId,
            product_id: id,
            warehouse_id: locationId,
            type: "opening_balance",
            quantity: qty,
            base_quantity: qty,
            unit_cost: cost,
            total_cost: cost * qty,
            reference: "Opening stock",
            reference_type: "opening",
            reason: "Opening stock",
            movement_date: new Date().toISOString().slice(0, 10),
          });
          if (error) throw error;
        }
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
