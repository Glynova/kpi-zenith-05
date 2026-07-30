import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "created_at",
    "label": "Date",
    "format": "date"
  },
  {
    "key": "type",
    "label": "Movement",
    "format": "badge"
  },
  {
    "key": "quantity",
    "label": "Qty",
    "format": "number"
  },
  {
    "key": "unit_cost",
    "label": "Unit cost",
    "format": "currency"
  },
  {
    "key": "batch_number",
    "label": "Batch"
  },
  {
    "key": "reference",
    "label": "Reference"
  }
];

const fields: Field[] = [
  {
    "key": "product_id",
    "label": "Product",
    "type": "relation",
    "relation": {
      "table": "products"
    },
    "required": true
  },
  {
    "key": "type",
    "label": "Movement type",
    "type": "select",
    "options": [
      "stock_in",
      "stock_out",
      "adjustment_in",
      "adjustment_out",
      "return_in",
      "damaged",
      "transfer_in",
      "transfer_out"
    ],
    "default": "stock_in"
  },
  {
    "key": "quantity",
    "label": "Quantity",
    "type": "number",
    "default": 1,
    "required": true
  },
  {
    "key": "unit_cost",
    "label": "Unit cost",
    "type": "number",
    "default": 0
  },
  {
    "key": "warehouse_id",
    "label": "Warehouse",
    "type": "relation",
    "relation": {
      "table": "warehouses"
    }
  },
  {
    "key": "batch_number",
    "label": "Batch number",
    "type": "text"
  },
  {
    "key": "reference",
    "label": "Reference",
    "type": "text"
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — KPIOptiva" },
      { name: "description", content: "Stock in, stock out, adjustments, returns, damage and transfers. Product stock updates automatically." },
      { property: "og:title", content: "Inventory — KPIOptiva" },
      { property: "og:description", content: "Stock in, stock out, adjustments, returns, damage and transfers. Product stock updates automatically." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="inventory_movements"
      title="Inventory"
      description={"Stock in, stock out, adjustments, returns, damage and transfers. Product stock updates automatically."}
      columns={columns}
      fields={fields}
      searchKeys={["reference","notes","type"]}
      orderBy="created_at"
      
    />
  ),
});
