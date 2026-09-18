import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    key: "name",
    label: "Customer",
  },
  {
    key: "type",
    label: "Type",
    format: "badge",
  },
  {
    key: "email",
    label: "Email",
  },
  {
    key: "phone",
    label: "Phone",
  },
  {
    key: "credit_limit",
    label: "Credit limit",
    format: "currency",
  },
  {
    key: "balance",
    label: "Balance",
    format: "currency",
  },
];

const fields: Field[] = [
  {
    key: "name",
    label: "Customer name",
    type: "text",
    required: true,
  },
  {
    key: "type",
    label: "Type",
    type: "select",
    options: ["walk_in", "wholesale", "credit", "corporate"],
    default: "walk_in",
  },
  {
    key: "email",
    label: "Email",
    type: "text",
  },
  {
    key: "phone",
    label: "Phone",
    type: "text",
  },
  {
    key: "credit_limit",
    label: "Credit limit",
    type: "number",
    default: 0,
  },
  {
    key: "balance",
    label: "Opening balance",
    type: "number",
    default: 0,
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["active", "inactive"],
    default: "active",
  },
  {
    key: "address",
    label: "Address",
    type: "textarea",
  },
  {
    key: "notes",
    label: "Notes",
    type: "textarea",
  },
];

export const Route = createFileRoute("/_authenticated/_shell/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Daraven ERP" },
      { name: "description", content: "Retail, wholesale and credit customers with balances." },
      { property: "og:title", content: "Customers — Daraven ERP" },
      {
        property: "og:description",
        content: "Retail, wholesale and credit customers with balances.",
      },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="sales"
      table="customers"
      title="Customers"
      description={"Retail, wholesale and credit customers with balances."}
      columns={columns}
      fields={fields}
      searchKeys={["name", "email", "phone"]}
      orderBy="created_at"
    />
  ),
});
