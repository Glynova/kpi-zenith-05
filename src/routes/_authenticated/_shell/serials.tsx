import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  { key: "serial_number", label: "Serial" },
  { key: "purchase_date", label: "Purchased", format: "date" },
  { key: "warranty_expiry", label: "Warranty", format: "date" },
  { key: "status", label: "Status", format: "badge" },
];

const fields: Field[] = [
  { key: "product_id", label: "Product", type: "relation", relation: { table: "products" }, required: true },
  { key: "serial_number", label: "Serial number", type: "text", required: true },
  { key: "variant_id", label: "Variant", type: "relation", relation: { table: "product_variants" } },
  { key: "warehouse_id", label: "Location", type: "relation", relation: { table: "warehouses" } },
  { key: "supplier_id", label: "Supplier", type: "relation", relation: { table: "suppliers" } },
  { key: "purchase_date", label: "Purchase date", type: "date" },
  { key: "warranty_expiry", label: "Warranty expiry", type: "date" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["in_stock", "reserved", "sold", "in_repair", "returned", "written_off"],
    default: "in_stock",
  },
  { key: "notes", label: "Notes", type: "textarea" },
];

const description =
  "One record per physical unit — serial, supplier, warranty, location and lifecycle status.";

export const Route = createFileRoute("/_authenticated/_shell/serials")({
  head: () => ({
    meta: [
      { title: "Serial Numbers — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Serial Numbers — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="inventory"
      table="serial_numbers"
      title="Serial Numbers"
      description={description}
      columns={columns}
      fields={fields}
      searchKeys={["serial_number", "status"]}
      orderBy="created_at"
    />
  ),
});
