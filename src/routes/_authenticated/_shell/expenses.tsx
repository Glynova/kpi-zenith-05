import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    key: "expense_date",
    label: "Date",
    format: "date",
  },
  {
    key: "category",
    label: "Category",
    format: "badge",
  },
  {
    key: "description",
    label: "Description",
  },
  {
    key: "vendor",
    label: "Vendor",
  },
  {
    key: "amount",
    label: "Amount",
    format: "currency",
  },
  {
    key: "status",
    label: "Status",
    format: "badge",
  },
];

const fields: Field[] = [
  {
    key: "category",
    label: "Category",
    type: "select",
    options: [
      "utilities",
      "rent",
      "payroll",
      "marketing",
      "fuel",
      "repairs",
      "supplies",
      "miscellaneous",
    ],
    default: "miscellaneous",
  },
  {
    key: "description",
    label: "Description",
    type: "text",
    required: true,
  },
  {
    key: "amount",
    label: "Amount",
    type: "number",
    default: 0,
    required: true,
  },
  {
    key: "expense_date",
    label: "Date",
    type: "date",
  },
  {
    key: "vendor",
    label: "Vendor",
    type: "text",
  },
  {
    key: "payment_method",
    label: "Payment method",
    type: "select",
    options: ["cash", "card", "bank_transfer", "mobile_money", "cheque"],
    default: "cash",
  },
  {
    key: "recurrence",
    label: "Recurrence",
    type: "select",
    options: ["none", "weekly", "monthly", "quarterly", "yearly"],
    default: "none",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["pending", "approved", "rejected"],
    default: "approved",
  },
  {
    key: "attachment_url",
    label: "Receipt / Attachment",
    type: "image",
    maxSizeMB: 5,
    uploadVariant: "dropzone",
    uploadHint: "Upload receipt or image",
  },
];

export const Route = createFileRoute("/_authenticated/_shell/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — Daraven ERP" },
      { name: "description", content: "Recurring and one-off spend across every category." },
      { property: "og:title", content: "Expenses — Daraven ERP" },
      { property: "og:description", content: "Recurring and one-off spend across every category." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="finance"
      table="expenses"
      title="Expenses"
      description={"Recurring and one-off spend across every category."}
      columns={columns}
      fields={fields}
      searchKeys={["description", "category", "vendor"]}
      orderBy="expense_date"
    />
  ),
});
