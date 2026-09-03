import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { useProductBom } from "@/components/product-bom-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBusiness } from "@/lib/business-context";
import type { Row } from "@/lib/db";
import { INVENTORY_MODELS, UNIT_OPTION_GROUPS } from "@/lib/business-config";




const columns: Column[] = [
  {
    "key": "image_url",
    "label": "Photo",
    "format": "image"
  },
  {
    "key": "name",
    "label": "Product"
  },
  {
    "key": "sku",
    "label": "SKU"
  },
  {
    "key": "brand",
    "label": "Brand"
  },
  {
    "key": "cost_price",
    "label": "Cost",
    "format": "currency"
  },
  {
    "key": "selling_price",
    "label": "Price",
    "format": "currency"
  },
  {
    "key": "stock",
    "label": "Stock",
    "format": "number"
  },
  {
    "key": "reorder_level",
    "label": "Reorder",
    "format": "number"
  },
  {
    "key": "expiration_date",
    "label": "Expires",
    "format": "date"
  },
  {
    "key": "status",
    "label": "Status",
    "format": "badge"
  }
];

const fields: Field[] = [
  {
    "key": "name",
    "label": "Product name",
    "type": "text",
    "required": true
  },
  {
    "key": "inventory_model",
    "label": "Product behaviour",
    "type": "select",
    "options": INVENTORY_MODELS,
    "default": "stocked_item"
  },
  {
    "key": "sku",
    "label": "SKU",
    "type": "text"
  },
  {
    "key": "barcode",
    "label": "Barcode",
    "type": "text"
  },
  {
    "key": "category_id",
    "label": "Category",
    "type": "relation",
    "relation": {
      "table": "categories"
    }
  },
  {
    "key": "supplier_id",
    "label": "Supplier",
    "type": "relation",
    "relation": {
      "table": "suppliers"
    }
  },
  {
    "key": "brand",
    "label": "Brand",
    "type": "text"
  },
  {
    "key": "unit",
    "label": "Unit",
    "type": "select",
    "optionGroups": UNIT_OPTION_GROUPS,
    "searchable": true,
    "default": "pcs"
  },
  {
    "key": "cost_price",
    "label": "Cost price",
    "type": "number",
    "default": 0
  },
  {
    "key": "selling_price",
    "label": "Selling price",
    "type": "number",
    "default": 0
  },
  {
    "key": "tax_rate",
    "label": "Tax rate (%)",
    "type": "number",
    "default": 0
  },
  {
    "key": "standard_cost",
    "label": "Standard cost",
    "type": "number",
    "default": 0
  },
  {
    "key": "reorder_level",
    "label": "Reorder level",
    "type": "number",
    "default": 0
  },
  {
    "key": "min_stock",
    "label": "Minimum stock",
    "type": "number",
    "default": 0
  },
  {
    "key": "max_stock",
    "label": "Maximum stock",
    "type": "number"
  },
  {
    "key": "batch_number",
    "label": "Batch number",
    "type": "text"
  },
  {
    "key": "serial_number",
    "label": "Serial number",
    "type": "text"
  },
  {
    "key": "expiration_date",
    "label": "Expiration date",
    "type": "date"
  },
  {
    "key": "image_url",
    "label": "Product image",
    "type": "image"
  },
  {
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "active",
      "inactive",
      "discontinued"
    ],
    "default": "active"
  },
  {
    "key": "description",
    "label": "Description",
    "type": "textarea"
  }
];

const description = "Your catalog. The form shows only the fields your business actually uses.";

/** Product form + table adapt to the business configuration from the setup wizard. */
function ProductsPage() {
  const { capability, feature, settings, businessId, currency } = useBusiness();
  const bom = useProductBom(businessId, currency);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const formFields = fields.filter((f) => keep(f.key)).map((field): Field => {
    if (field.key === "cost_price") {
      return {
        ...field,
        label: "Cost price",
        render: ({ form, setForm }) =>
          isFinished(form) ? (
            <div>
              <Input value={Number(form.cost_price ?? 0).toFixed(2)} readOnly disabled />
              <p className="mt-1 text-[11px] text-muted-foreground">Auto-calculated from components</p>
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
      columns={columns.filter((c) => keep(c.key))}
      fields={formFields}
      searchKeys={["name", "sku", "barcode", "brand"]}
      orderBy="created_at"
      illustration="inventory"
      steps={[
        {
          title: "Basics",
          description: "What is this product and how should it behave?",
          fields: ["name", "inventory_model", "sku", "barcode", "category_id", "brand", "unit", "status"],
        },
        {
          title: "Pricing",
          description: "Cost, price and tax. Recipes for finished products live here too.",
          fields: ["cost_price", "selling_price", "tax_rate", "standard_cost"],
        },
        {
          title: "Stock",
          description: "Reorder rules and tracking details.",
          fields: [
            "supplier_id",
            "reorder_level",
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
      }}
      formExtrasAfter="cost_price"
      formExtras={({ form, setForm }) =>
        isFinished(form) ? (
          <bom.Section
            productName={String(form.name ?? "")}

            excludeProductId={editingId}
            onCostChange={(cost) => setForm({ ...form, cost_price: Number(cost.toFixed(4)) })}
          />
        ) : null
      }
      validate={({ form }) => (isFinished(form) ? bom.validate() : null)}
      afterSave={async ({ form, id }) => {
        if (!isFinished(form)) return;
        await bom.persist(id, String(form.name ?? ""));
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
      { title: "Products — KPIOptiva" },
      { name: "description", content: description },
      { property: "og:title", content: "Products — KPIOptiva" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

