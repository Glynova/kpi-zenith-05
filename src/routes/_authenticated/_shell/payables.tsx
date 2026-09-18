import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    key: "due_date",
    label: "Due",
    format: "date",
  },
  {
    key: "amount",
    label: "Amount",
    format: "currency",
  },
  {
    key: "paid",
    label: "Paid",
    format: "currency",
  },
  {
    key: "status",
    label: "Status",
    format: "badge",
  },
  {
    key: "notes",
    label: "Notes",
  },
];

const fields: Field[] = [
  {
    key: "supplier_id",
    label: "Supplier",
    type: "relation",
    relation: {
      table: "suppliers",
    },
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
    key: "paid",
    label: "Paid",
    type: "number",
    default: 0,
  },
  {
    key: "due_date",
    label: "Due date",
    type: "date",
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["open", "partial", "settled", "overdue"],
    default: "open",
  },
  {
    key: "notes",
    label: "Notes",
    type: "textarea",
  },
];

export const Route = createFileRoute("/_authenticated/_shell/payables")({
  head: () => ({
    meta: [
      { title: "Payables — Daraven ERP" },
      { name: "description", content: "Supplier debts, schedules and remaining balances." },
      { property: "og:title", content: "Payables — Daraven ERP" },
      { property: "og:description", content: "Supplier debts, schedules and remaining balances." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="finance"
      table="accounts_payable"
      title="Payables"
      description={"Supplier debts, schedules and remaining balances."}
      columns={columns}
      fields={fields}
      searchKeys={["status", "notes"]}
      orderBy="created_at"
    />
  ),
});
