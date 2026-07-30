import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "invoice_number",
    "label": "Invoice #"
  },
  {
    "key": "issue_date",
    "label": "Issued",
    "format": "date"
  },
  {
    "key": "due_date",
    "label": "Due",
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
  },
  {
    "key": "status",
    "label": "Status",
    "format": "badge"
  }
];

const fields: Field[] = [
  {
    "key": "invoice_number",
    "label": "Invoice number",
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
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "draft",
      "unpaid",
      "partial",
      "paid",
      "overdue",
      "cancelled"
    ],
    "default": "unpaid"
  },
  {
    "key": "issue_date",
    "label": "Issue date",
    "type": "date"
  },
  {
    "key": "due_date",
    "label": "Due date",
    "type": "date"
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
    "label": "Tax / VAT",
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
    "key": "terms",
    "label": "Terms",
    "type": "textarea"
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — KPIOptiva" },
      { name: "description", content: "Issue professional invoices with due dates, tax and terms." },
      { property: "og:title", content: "Invoices — KPIOptiva" },
      { property: "og:description", content: "Issue professional invoices with due dates, tax and terms." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="invoices"
      title="Invoices"
      description={"Issue professional invoices with due dates, tax and terms."}
      columns={columns}
      fields={fields}
      searchKeys={["invoice_number","status"]}
      orderBy="issue_date"
      
    />
  ),
});
