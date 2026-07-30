import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "sale_number",
    "label": "Sale #"
  },
  {
    "key": "sale_date",
    "label": "Date",
    "format": "date"
  },
  {
    "key": "sale_type",
    "label": "Type",
    "format": "badge"
  },
  {
    "key": "payment_method",
    "label": "Payment",
    "format": "badge"
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
  },
  {
    "key": "payment_status",
    "label": "Status",
    "format": "badge"
  }
];

const fields: Field[] = [
  {
    "key": "sale_number",
    "label": "Sale number",
    "type": "text",
    "required": true
  },
  {
    "key": "customer_id",
    "label": "Customer",
    "type": "relation",
    "relation": {
      "table": "customers"
    }
  },
  {
    "key": "sale_type",
    "label": "Sale type",
    "type": "select",
    "options": [
      "walk_in",
      "wholesale",
      "credit",
      "return",
      "refund"
    ],
    "default": "walk_in"
  },
  {
    "key": "sale_date",
    "label": "Sale date",
    "type": "date"
  },
  {
    "key": "payment_method",
    "label": "Payment method",
    "type": "select",
    "options": [
      "cash",
      "card",
      "bank_transfer",
      "mobile_money",
      "cheque",
      "credit"
    ],
    "default": "cash"
  },
  {
    "key": "payment_status",
    "label": "Payment status",
    "type": "select",
    "options": [
      "paid",
      "partial",
      "unpaid"
    ],
    "default": "paid"
  },
  {
    "key": "subtotal",
    "label": "Subtotal",
    "type": "number",
    "default": 0
  },
  {
    "key": "discount",
    "label": "Discount",
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
    "label": "Amount paid",
    "type": "number",
    "default": 0
  },
  {
    "key": "cost_total",
    "label": "Cost of goods",
    "type": "number",
    "default": 0
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/sales")({
  head: () => ({
    meta: [
      { title: "Sales — KPIOptiva" },
      { name: "description", content: "Walk-in, wholesale and credit sales with payment tracking." },
      { property: "og:title", content: "Sales — KPIOptiva" },
      { property: "og:description", content: "Walk-in, wholesale and credit sales with payment tracking." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="sales"
      title="Sales"
      description={"Walk-in, wholesale and credit sales with payment tracking."}
      columns={columns}
      fields={fields}
      searchKeys={["sale_number","sale_type","payment_method"]}
      orderBy="sale_date"
      
    />
  ),
});
