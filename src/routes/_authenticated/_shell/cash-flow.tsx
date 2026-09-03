import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "transaction_date",
    "label": "Date",
    "format": "date"
  },
  {
    "key": "type",
    "label": "Direction",
    "format": "badge"
  },
  {
    "key": "category",
    "label": "Category"
  },
  {
    "key": "description",
    "label": "Description"
  },
  {
    "key": "amount",
    "label": "Amount",
    "format": "currency"
  }
];

const fields: Field[] = [
  {
    "key": "type",
    "label": "Direction",
    "type": "select",
    "options": [
      "in",
      "out"
    ],
    "default": "in"
  },
  {
    "key": "amount",
    "label": "Amount",
    "type": "number",
    "default": 0,
    "required": true
  },
  {
    "key": "category",
    "label": "Category",
    "type": "text"
  },
  {
    "key": "description",
    "label": "Description",
    "type": "text"
  },
  {
    "key": "reference",
    "label": "Reference",
    "type": "text"
  },
  {
    "key": "transaction_date",
    "label": "Date",
    "type": "date"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/cash-flow")({
  head: () => ({
    meta: [
      { title: "Cash Flow — KPIOptiva" },
      { name: "description", content: "Every cash movement in and out of the business." },
      { property: "og:title", content: "Cash Flow — KPIOptiva" },
      { property: "og:description", content: "Every cash movement in and out of the business." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="finance"
      table="cash_transactions"
      title="Cash Flow"
      description={"Every cash movement in and out of the business."}
      columns={columns}
      fields={fields}
      searchKeys={["description","category","reference"]}
      orderBy="transaction_date"
      
    />
  ),
});
