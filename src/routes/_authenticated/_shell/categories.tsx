import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "name",
    "label": "Category"
  },
  {
    "key": "description",
    "label": "Description"
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
    "key": "description",
    "label": "Description",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/categories")({
  head: () => ({
    meta: [
      { title: "Categories — KPIOptiva" },
      { name: "description", content: "Organise your catalog into reportable groups." },
      { property: "og:title", content: "Categories — KPIOptiva" },
      { property: "og:description", content: "Organise your catalog into reportable groups." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="inventory"
      table="categories"
      title="Categories"
      description={"Organise your catalog into reportable groups."}
      columns={columns}
      fields={fields}
      searchKeys={["name"]}
      orderBy="created_at"
      
    />
  ),
});
