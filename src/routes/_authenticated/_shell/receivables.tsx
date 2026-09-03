import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "due_date",
    "label": "Due",
    "format": "date"
  },
  {
    "key": "amount",
    "label": "Amount",
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
  },
  {
    "key": "notes",
    "label": "Notes"
  }
];

const fields: Field[] = [
  {
    "key": "customer_id",
    "label": "Customer",
    "type": "relation",
    "relation": {
      "table": "customers"
    },
    "required": true
  },
  {
    "key": "amount",
    "label": "Amount",
    "type": "number",
    "default": 0,
    "required": true
  },
  {
    "key": "paid",
    "label": "Paid",
    "type": "number",
    "default": 0
  },
  {
    "key": "due_date",
    "label": "Due date",
    "type": "date"
  },
  {
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "open",
      "partial",
      "settled",
      "overdue",
      "written_off"
    ],
    "default": "open"
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/receivables")({
  head: () => ({
    meta: [
      { title: "Receivables — Daraven ERP" },
      { name: "description", content: "Customer debts, partial payments and aging." },
      { property: "og:title", content: "Receivables — Daraven ERP" },
      { property: "og:description", content: "Customer debts, partial payments and aging." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="finance"
      table="accounts_receivable"
      title="Receivables"
      description={"Customer debts, partial payments and aging."}
      columns={columns}
      fields={fields}
      searchKeys={["status","notes"]}
      orderBy="created_at"
      
    />
  ),
});
