import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "name",
    "label": "Supplier"
  },
  {
    "key": "contact_person",
    "label": "Contact"
  },
  {
    "key": "email",
    "label": "Email"
  },
  {
    "key": "phone",
    "label": "Phone"
  },
  {
    "key": "balance",
    "label": "Balance",
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
    "key": "name",
    "label": "Supplier name",
    "type": "text",
    "required": true
  },
  {
    "key": "contact_person",
    "label": "Contact person",
    "type": "text"
  },
  {
    "key": "email",
    "label": "Email",
    "type": "text"
  },
  {
    "key": "phone",
    "label": "Phone",
    "type": "text"
  },
  {
    "key": "tax_number",
    "label": "Tax number",
    "type": "text"
  },
  {
    "key": "balance",
    "label": "Opening balance",
    "type": "number",
    "default": 0
  },
  {
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "active",
      "inactive"
    ],
    "default": "active"
  },
  {
    "key": "address",
    "label": "Address",
    "type": "textarea"
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — KPIOptiva" },
      { name: "description", content: "Vendor directory with balances and contact details." },
      { property: "og:title", content: "Suppliers — KPIOptiva" },
      { property: "og:description", content: "Vendor directory with balances and contact details." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="inventory"
      table="suppliers"
      title="Suppliers"
      description={"Vendor directory with balances and contact details."}
      columns={columns}
      fields={fields}
      searchKeys={["name","email","phone"]}
      orderBy="created_at"
      
    />
  ),
});
