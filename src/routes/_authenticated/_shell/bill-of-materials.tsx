import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "name",
    "label": "BOM"
  },
  {
    "key": "type",
    "label": "Type",
    "format": "badge"
  },
  {
    "key": "output_quantity",
    "label": "Output qty",
    "format": "number"
  },
  {
    "key": "created_at",
    "label": "Created",
    "format": "date"
  }
];

const fields: Field[] = [
  {
    "key": "name",
    "label": "Name",
    "type": "text",
    "required": true
  },
  {
    "key": "product_id",
    "label": "Finished product",
    "type": "relation",
    "relation": {
      "table": "products"
    },
    "required": true
  },
  {
    "key": "type",
    "label": "Type",
    "type": "select",
    "options": [
      "recipe",
      "assembly",
      "bundle",
      "manufacturing"
    ],
    "default": "recipe"
  },
  {
    "key": "output_quantity",
    "label": "Output quantity",
    "type": "number",
    "default": 1
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/bill-of-materials")({
  head: () => ({
    meta: [
      { title: "Bill of Materials — KPIOptiva" },
      { name: "description", content: "Recipes, assemblies and bundles for manufactured goods." },
      { property: "og:title", content: "Bill of Materials — KPIOptiva" },
      { property: "og:description", content: "Recipes, assemblies and bundles for manufactured goods." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="bill_of_materials"
      title="Bill of Materials"
      description={"Recipes, assemblies and bundles for manufactured goods."}
      columns={columns}
      fields={fields}
      searchKeys={["name"]}
      orderBy="created_at"
      
    />
  ),
});
