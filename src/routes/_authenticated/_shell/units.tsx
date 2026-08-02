import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { UNIT_CATEGORIES } from "@/lib/business-config";

const unitColumns: Column[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Unit" },
  { key: "category", label: "Category", format: "badge" },
  { key: "is_base", label: "Base unit", format: "boolean" },
];

const unitFields: Field[] = [
  { key: "code", label: "Code", type: "text", required: true, placeholder: "kg" },
  { key: "name", label: "Name", type: "text", required: true, placeholder: "Kilogram" },
  { key: "category", label: "Category", type: "select", options: UNIT_CATEGORIES, default: "count" },
  { key: "is_base", label: "Base unit for its category", type: "boolean", default: false },
];

const convColumns: Column[] = [
  { key: "from_unit", label: "From" },
  { key: "to_unit", label: "To" },
  { key: "factor", label: "Factor", format: "number" },
];

const convFields: Field[] = [
  { key: "from_unit", label: "From unit", type: "text", required: true, placeholder: "case" },
  { key: "to_unit", label: "To unit", type: "text", required: true, placeholder: "pcs" },
  { key: "factor", label: "Factor (1 from = N to)", type: "number", default: 1, required: true },
  {
    key: "product_id",
    label: "Only for product (optional)",
    type: "relation",
    relation: { table: "products" },
  },
];

const description = "Define the units you buy, stock and sell in, plus how they convert.";

export const Route = createFileRoute("/_authenticated/_shell/units")({
  head: () => ({
    meta: [
      { title: "Units of Measure — KPIOptiva" },
      { name: "description", content: description },
      { property: "og:title", content: "Units of Measure — KPIOptiva" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnitsPage,
});

function UnitsPage() {
  return (
    <div className="space-y-10">
      <ResourcePage
        table="units_of_measure"
        title="Units of Measure"
        description={description}
        columns={unitColumns}
        fields={unitFields}
        searchKeys={["code", "name", "category"]}
        orderBy="code"
      />
      <ResourcePage
        table="unit_conversions"
        title="Unit Conversions"
        description="Examples: 1 kg = 1000 g, 1 L = 1000 ml, 1 case = 24 pcs, 1 dozen = 12 pcs."
        columns={convColumns}
        fields={convFields}
        searchKeys={["from_unit", "to_unit"]}
        orderBy="created_at"
      />
    </div>
  );
}
