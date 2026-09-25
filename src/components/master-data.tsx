import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { LOCATION_TYPES } from "@/lib/business-config";

export const MASTER_DATA_TABS = ["categories", "suppliers", "locations"] as const;
export type MasterDataTab = (typeof MASTER_DATA_TABS)[number];

/** Old standalone routes -> Master Data tab (kept so deep links keep working). */
export const LEGACY_MASTER_DATA_ROUTES: Record<string, MasterDataTab> = {
  "/categories": "categories",
  "/suppliers": "suppliers",
  "/locations": "locations",
};

export function parseMasterDataTab(value: unknown): MasterDataTab {
  return MASTER_DATA_TABS.includes(value as MasterDataTab)
    ? (value as MasterDataTab)
    : "categories";
}

const categoryColumns: Column[] = [
  { key: "name", label: "Category" },
  { key: "description", label: "Description" },
  { key: "created_at", label: "Created", format: "date" },
];
const categoryFields: Field[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
];

export function CategoriesPanel() {
  return (
    <ResourcePage
      illustration="inventory"
      table="categories"
      title="Categories"
      description="Organise your catalog into reportable groups."
      columns={categoryColumns}
      fields={categoryFields}
      searchKeys={["name"]}
      orderBy="created_at"
    />
  );
}

const supplierColumns: Column[] = [
  { key: "name", label: "Supplier" },
  { key: "contact_person", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "balance", label: "Balance", format: "currency" },
  { key: "status", label: "Status", format: "badge" },
];
const supplierFields: Field[] = [
  { key: "name", label: "Supplier name", type: "text", required: true },
  { key: "contact_person", label: "Contact person", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "tax_number", label: "Tax number", type: "text" },
  { key: "balance", label: "Opening balance", type: "number", default: 0 },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["active", "inactive"],
    default: "active",
  },
  { key: "address", label: "Address", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export function SuppliersPanel() {
  return (
    <ResourcePage
      illustration="inventory"
      table="suppliers"
      title="Suppliers"
      description="Vendor directory with balances and contact details."
      columns={supplierColumns}
      fields={supplierFields}
      searchKeys={["name", "email", "phone"]}
      orderBy="created_at"
    />
  );
}

const locationColumns: Column[] = [
  { key: "name", label: "Location" },
  { key: "code", label: "Code" },
  { key: "type", label: "Type", format: "badge" },
  { key: "location", label: "Address" },
  { key: "is_default", label: "Default", format: "boolean" },
  { key: "is_active", label: "Active", format: "boolean" },
];
const locationFields: Field[] = [
  { key: "name", label: "Location name", type: "text", required: true },
  { key: "code", label: "Code", type: "text", placeholder: "MAIN" },
  { key: "type", label: "Type", type: "select", options: LOCATION_TYPES, default: "warehouse" },
  {
    key: "parent_id",
    label: "Parent location",
    type: "relation",
    relation: { table: "warehouses" },
  },
  { key: "location", label: "Address", type: "text" },
  { key: "is_default", label: "Default location", type: "boolean", default: false },
  { key: "is_active", label: "Active", type: "boolean", default: true },
];

export function LocationsPanel() {
  return (
    <ResourcePage
      illustration="inventory"
      table="warehouses"
      title="Locations"
      description="Branches, warehouses, kitchens and sites. Stock is tracked per location and transfers move it between them."
      columns={locationColumns}
      fields={locationFields}
      searchKeys={["name", "code", "location"]}
      orderBy="created_at"
    />
  );
}
