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
    "label": "Type",
    "format": "badge"
  },
  {
    "key": "title",
    "label": "Title"
  },
  {
    "key": "message",
    "label": "Message"
  }
];

const fields: Field[] = [
  {
    "key": "type",
    "label": "Type",
    "type": "select",
    "options": [
      "info",
      "low_stock",
      "out_of_stock",
      "expiring",
      "invoice_due",
      "debt_due",
      "payroll_due",
      "purchase_approval",
      "sales_target"
    ],
    "default": "info"
  },
  {
    "key": "title",
    "label": "Title",
    "type": "text",
    "required": true
  },
  {
    "key": "message",
    "label": "Message",
    "type": "textarea"
  },
  {
    "key": "link",
    "label": "Link",
    "type": "text"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — KPIOptiva" },
      { name: "description", content: "Stock, invoice, debt and payroll alerts for your team." },
      { property: "og:title", content: "Notifications — KPIOptiva" },
      { property: "og:description", content: "Stock, invoice, debt and payroll alerts for your team." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="notifications"
      title="Notifications"
      description={"Stock, invoice, debt and payroll alerts for your team."}
      columns={columns}
      fields={fields}
      searchKeys={["title","message","type"]}
      orderBy="created_at"
      
    />
  ),
});
