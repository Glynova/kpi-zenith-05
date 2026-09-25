export type AppRole =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "hr"
  | "cashier"
  | "inventory_staff"
  | "warehouse_staff"
  | "employee"
  | "auditor";

export type Section = "overview" | "catalog" | "operations" | "finance" | "people" | "system";

/** Route -> section it belongs to. */
export const ROUTE_SECTION: Record<string, Section> = {
  "/dashboard": "overview",
  "/analytics": "overview",
  "/reports": "overview",
  "/products": "catalog",
  "/categories": "catalog",
  "/suppliers": "catalog",
  "/customers": "catalog",

  "/variants": "catalog",
  "/batches": "catalog",
  "/serials": "catalog",
  "/units": "catalog",
  "/locations": "catalog",
  "/inventory/master-data": "catalog",
  "/inventory": "operations",
  "/stock-counts": "operations",
  "/transfers": "operations",
  "/purchase-orders": "operations",
  "/pos": "operations",
  "/registers": "operations",
  "/sales-analytics": "overview",
  "/sales": "operations",
  "/invoices": "operations",
  "/expenses": "finance",
  "/cash-flow": "finance",
  "/receivables": "finance",
  "/payables": "finance",
  "/employees": "people",
  "/attendance": "people",
  "/payroll": "people",
  "/notifications": "system",
  "/audit-logs": "system",
  "/settings": "system",
  "/billing": "system",
  "/platform-billing": "system",
};

/** Sections each role may open. "system" (notifications/settings) is open to everyone. */
const ROLE_SECTIONS: Record<AppRole, Section[]> = {
  owner: ["overview", "catalog", "operations", "finance", "people", "system"],
  admin: ["overview", "catalog", "operations", "finance", "people", "system"],
  manager: ["overview", "operations", "people", "system"],
  accountant: ["overview", "finance", "system"],
  hr: ["people", "system"],
  inventory_staff: ["catalog", "system"],
  warehouse_staff: ["catalog", "operations", "system"],
  cashier: ["overview", "operations", "system"],
  employee: ["overview", "system"],
  auditor: ["overview", "system"],
};

/** Individual routes granted beyond a role's sections. */
const ROLE_EXTRA_ROUTES: Partial<Record<AppRole, string[]>> = {
  // Encoders may raise purchase orders for owner approval.
  inventory_staff: ["/purchase-orders"],
};

/** Routes only these roles may open, regardless of section access. */
const ROUTE_ROLE_LOCK: Record<string, AppRole[]> = {
  "/audit-logs": ["owner", "admin", "auditor"],
  // Subscription and payment details stay with the business owners/admins.
  "/billing": ["owner", "admin"],
  "/platform-billing": ["owner", "admin"],
};

export function canAccessRoute(role: AppRole | null, url: string): boolean {
  if (!role) return false;
  const lock = ROUTE_ROLE_LOCK[url];
  if (lock && !lock.includes(role)) return false;
  if (ROLE_EXTRA_ROUTES[role]?.includes(url)) return true;
  const section = ROUTE_SECTION[url];
  if (!section) return true;
  return ROLE_SECTIONS[role].includes(section);
}

export function canApprovePurchaseOrders(role: AppRole | null): boolean {
  return role === "owner";
}

export const APPROVAL_STATUSES = [
  "approved",
  "ordered",
  "partially_received",
  "received",
  "completed",
];

export const ROLE_OPTIONS: { value: AppRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full access except business ownership" },
  {
    value: "manager",
    label: "Supervisor / Manager",
    description: "Overview, operations and people",
  },
  {
    value: "accountant",
    label: "Accountant / Bookkeeper",
    description: "Overview and finance modules",
  },
  { value: "hr", label: "HR", description: "People modules only (employees, attendance, payroll)" },
  {
    value: "inventory_staff",
    label: "Encoder / Inventory",
    description: "Catalog modules and can raise purchase orders for approval",
  },
  { value: "warehouse_staff", label: "Warehouse Staff", description: "Catalog and operations" },
  { value: "cashier", label: "Cashier", description: "Overview and operations" },
  { value: "employee", label: "Employee", description: "Overview only" },
  { value: "auditor", label: "Auditor", description: "Read-only business performance" },
];

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  ...Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label])),
};
