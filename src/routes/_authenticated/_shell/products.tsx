import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
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
    "type": "text",
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
    "key": "reorder_level",
    "label": "Reorder level",
    "type": "number",
    "default": 0
  },
  {
    "key": "stock",
    "label": "Opening stock",
    "type": "number",
    "default": 0
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
    "label": "Image URL",
    "type": "text"
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

export const Route = createFileRoute("/_authenticated/_shell/products")({
  head: () => ({
    meta: [
      { title: "Products — KPIOptiva" },
      { name: "description", content: "Full catalog with SKU, pricing, stock and expiry tracking." },
      { property: "og:title", content: "Products — KPIOptiva" },
      { property: "og:description", content: "Full catalog with SKU, pricing, stock and expiry tracking." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="products"
      title="Products"
      description={"Full catalog with SKU, pricing, stock and expiry tracking."}
      columns={columns}
      fields={fields}
      searchKeys={["name","sku","barcode","brand"]}
      orderBy="created_at"
      
    />
  ),
});
