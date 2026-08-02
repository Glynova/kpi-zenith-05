import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  { key: "name", label: "Variant" },
  { key: "sku", label: "SKU" },
  { key: "barcode", label: "Barcode" },
  { key: "cost_price", label: "Cost", format: "currency" },
  { key: "selling_price", label: "Price", format: "currency" },
  { key: "stock", label: "Stock", format: "number" },
  { key: "reorder_level", label: "Reorder", format: "number" },
  { key: "status", label: "Status", format: "badge" },
];

const fields: Field[] = [
  { key: "product_id", label: "Product", type: "relation", relation: { table: "products" }, required: true },
  { key: "name", label: "Variant name", type: "text", required: true, placeholder: "Black / M" },
  { key: "sku", label: "SKU", type: "text" },
  { key: "barcode", label: "Barcode", type: "text" },
  { key: "cost_price", label: "Cost price", type: "number", default: 0 },
  { key: "selling_price", label: "Selling price", type: "number", default: 0 },
  { key: "stock", label: "Opening stock", type: "number", default: 0 },
  { key: "reorder_level", label: "Reorder level", type: "number", default: 0 },
  { key: "status", label: "Status", type: "select", options: ["active", "inactive"], default: "active" },
];

const description =
  "Size, colour or style variants. Each variant carries its own SKU, barcode, pricing and stock.";

export const Route = createFileRoute("/_authenticated/_shell/variants")({
  head: () => ({
    meta: [
      { title: "Product Variants — KPIOptiva" },
      { name: "description", content: description },
      { property: "og:title", content: "Product Variants — KPIOptiva" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ResourcePage
      table="product_variants"
      title="Product Variants"
      description={description}
      columns={columns}
      fields={fields}
      searchKeys={["name", "sku", "barcode"]}
      orderBy="created_at"
    />
  ),
});
