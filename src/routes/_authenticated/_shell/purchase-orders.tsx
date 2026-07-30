import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "po_number",
    "label": "PO #"
  },
  {
    "key": "status",
    "label": "Status",
    "format": "badge"
  },
  {
    "key": "order_date",
    "label": "Ordered",
    "format": "date"
  },
  {
    "key": "expected_date",
    "label": "Expected",
    "format": "date"
  },
  {
    "key": "total",
    "label": "Total",
    "format": "currency"
  },
  {
    "key": "paid",
    "label": "Paid",
    "format": "currency"
  }
];

const fields: Field[] = [
  {
    "key": "po_number",
    "label": "PO number",
    "type": "text",
    "required": true
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
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "draft",
      "pending_approval",
      "approved",
      "ordered",
      "partially_received",
      "received",
      "completed",
      "cancelled"
    ],
    "default": "draft"
  },
  {
    "key": "order_date",
    "label": "Order date",
    "type": "date"
  },
  {
    "key": "expected_date",
    "label": "Expected date",
    "type": "date"
  },
  {
    "key": "subtotal",
    "label": "Subtotal",
    "type": "number",
    "default": 0
  },
  {
    "key": "tax",
    "label": "Tax",
    "type": "number",
    "default": 0
  },
  {
    "key": "total",
    "label": "Total",
    "type": "number",
    "default": 0
  },
  {
    "key": "paid",
    "label": "Paid",
    "type": "number",
    "default": 0
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/purchase-orders")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — KPIOptiva" },
      { name: "description", content: "Draft to received workflow with supplier balances and totals." },
      { property: "og:title", content: "Purchase Orders — KPIOptiva" },
      { property: "og:description", content: "Draft to received workflow with supplier balances and totals." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="purchase_orders"
      title="Purchase Orders"
      description={"Draft to received workflow with supplier balances and totals."}
      columns={columns}
      fields={fields}
      searchKeys={["po_number","status"]}
      orderBy="created_at"
      
    />
  ),
});
