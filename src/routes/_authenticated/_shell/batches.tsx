import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  { key: "batch_number", label: "Batch" },
  { key: "lot_number", label: "Lot" },
  { key: "manufactured_date", label: "Made", format: "date" },
  { key: "expiry_date", label: "Expires", format: "date" },
  { key: "quantity", label: "Received", format: "number" },
  { key: "remaining_quantity", label: "Remaining", format: "number" },
  { key: "unit_cost", label: "Unit cost", format: "currency" },
  { key: "status", label: "Status", format: "badge" },
];

const fields: Field[] = [
  { key: "product_id", label: "Product", type: "relation", relation: { table: "products" }, required: true },
  { key: "batch_number", label: "Batch number", type: "text", required: true },
  { key: "lot_number", label: "Lot number", type: "text" },
  { key: "warehouse_id", label: "Location", type: "relation", relation: { table: "warehouses" } },
  { key: "supplier_id", label: "Supplier", type: "relation", relation: { table: "suppliers" } },
  { key: "manufactured_date", label: "Manufactured date", type: "date" },
  { key: "expiry_date", label: "Expiry date", type: "date" },
  { key: "quantity", label: "Quantity received", type: "number", default: 0 },
  { key: "remaining_quantity", label: "Remaining quantity", type: "number", default: 0 },
  { key: "unit_cost", label: "Unit cost", type: "number", default: 0 },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["active", "quarantined", "recalled", "expired", "consumed"],
    default: "active",
  },
  { key: "notes", label: "Notes", type: "textarea" },
];

const description =
  "Batch and lot control with manufacturing and expiry dates. Expiring stock is surfaced on the dashboard and in alerts.";

export const Route = createFileRoute("/_authenticated/_shell/batches")({
  head: () => ({
    meta: [
      { title: "Batches & Expiry — KPIOptiva" },
      { name: "description", content: description },
      { property: "og:title", content: "Batches & Expiry — KPIOptiva" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="inventory"
      table="batches"
      title="Batches"
      description={description}
      columns={columns}
      fields={fields}
      searchKeys={["batch_number", "lot_number", "status"]}
      orderBy="created_at"
    />
  ),
});
