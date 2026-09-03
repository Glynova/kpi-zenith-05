import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { LOCATION_TYPES } from "@/lib/business-config";

const columns: Column[] = [
  { key: "name", label: "Location" },
  { key: "code", label: "Code" },
  { key: "type", label: "Type", format: "badge" },
  { key: "location", label: "Address" },
  { key: "is_default", label: "Default", format: "boolean" },
  { key: "is_active", label: "Active", format: "boolean" },
];

const fields: Field[] = [
  { key: "name", label: "Location name", type: "text", required: true },
  { key: "code", label: "Code", type: "text", placeholder: "MAIN" },
  { key: "type", label: "Type", type: "select", options: LOCATION_TYPES, default: "warehouse" },
  { key: "parent_id", label: "Parent location", type: "relation", relation: { table: "warehouses" } },
  { key: "location", label: "Address", type: "text" },
  { key: "is_default", label: "Default location", type: "boolean", default: false },
  { key: "is_active", label: "Active", type: "boolean", default: true },
];

const description =
  "Branches, warehouses, kitchens and sites. Stock is tracked per location and transfers move it between them.";

export const Route = createFileRoute("/_authenticated/_shell/locations")({
  head: () => ({
    meta: [
      { title: "Locations — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Locations — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="inventory"
      table="warehouses"
      title="Locations"
      description={description}
      columns={columns}
      fields={fields}
      searchKeys={["name", "code", "location"]}
      orderBy="created_at"
    />
  ),
});
