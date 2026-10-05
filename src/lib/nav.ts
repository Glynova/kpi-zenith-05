import {
  Sparkles,
  LayoutDashboard,
  Package,
  Tags,
  Users,
  Boxes,
  ClipboardList,
  ShoppingCart,
  FileText,
  Receipt,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  UserCog,
  CalendarClock,
  BarChart3,
  Bell,
  LineChart,
  Settings,
  ScrollText,
  Palette,
  Ruler,
  Barcode,
  ArrowLeftRight,
  ClipboardCheck,
  ScanLine,
  Factory,
  Landmark,
  CreditCard,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { FeatureKey } from "@/lib/business-config";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  feature?: FeatureKey;
  /** Extra words that should match in the command palette. */
  keywords?: string;
  /** Tabs shown nested under this item (links carry ?tab=). */
  children?: { title: string; tab: string; feature?: FeatureKey }[];
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A group with a url is a direct link (no children). */
  url?: string;
  items: NavItem[];
};

/**
 * Seven top-level sections. Everything else is collapsed inside them so the
 * sidebar never shows more than a handful of entries at rest.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    url: "/dashboard",
    items: [],
  },
  {
    id: "sales",
    label: "Sales",
    icon: ShoppingCart,
    items: [
      {
        title: "Point of Sale",
        url: "/pos",
        icon: ScanLine,
        feature: "enable_pos",
        keywords: "till register checkout",
      },
      { title: "Sales", url: "/sales", icon: ShoppingCart, keywords: "orders quotes revenue" },
      { title: "Invoices", url: "/invoices", icon: FileText, keywords: "billing" },
      { title: "Customers", url: "/customers", icon: Users, keywords: "clients buyers" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: Boxes,
    items: [
      { title: "Products", url: "/products", icon: Package, keywords: "items catalog sku" },
      {
        title: "Master Data",
        url: "/inventory/master-data",
        icon: Tags,
        keywords: "categories suppliers vendors locations warehouse branch setup",
        children: [
          { title: "Categories", tab: "categories" },
          { title: "Suppliers", tab: "suppliers", feature: "enable_purchasing" },
          { title: "Locations", tab: "locations" },
        ],
      },
      { title: "Stock Movements", url: "/inventory", icon: Boxes, keywords: "ledger stock in out" },
      {
        title: "Stock Counts",
        url: "/stock-counts",
        icon: ClipboardCheck,
        feature: "enable_stock_counts",
      },
      { title: "Transfers", url: "/transfers", icon: ArrowLeftRight, feature: "track_locations" },
      {
        title: "Purchase Orders",
        url: "/purchase-orders",
        icon: ClipboardList,
        keywords: "po purchasing receive",
      },
      { title: "Restock List", url: "/restock", icon: ClipboardList, keywords: "reorder low stock" },
      { title: "Wastage", url: "/wastage", icon: Boxes, keywords: "waste spoiled dropped expired" },
      { title: "Units", url: "/units", icon: Ruler, keywords: "uom measure" },
      {
        title: "Batches",
        url: "/batches",
        icon: Factory,
        feature: "track_batch",
        keywords: "lot expiry",
      },
      { title: "Serial Numbers", url: "/serials", icon: Barcode, feature: "track_serial" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Landmark,
    items: [
      { title: "Expenses", url: "/expenses", icon: Receipt, keywords: "costs spend" },
      { title: "Cash Flow", url: "/cash-flow", icon: Wallet, keywords: "cash in out" },
      {
        title: "Receivables",
        url: "/receivables",
        icon: ArrowDownLeft,
        keywords: "ar debtors owed",
      },
      { title: "Payables", url: "/payables", icon: ArrowUpRight, keywords: "ap creditors bills" },
      { title: "Receivables Aging", url: "/ar-aging", icon: ArrowDownLeft, keywords: "aging overdue debtors as of" },
      { title: "Tax Records", url: "/tax", icon: Receipt, keywords: "vat withholding 2307 bir certificate" },
      { title: "Daily Close", url: "/daily-close", icon: CalendarClock, keywords: "z reading end of day close" },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: UsersRound,
    items: [
      { title: "Employees", url: "/employees", icon: UserCog, keywords: "staff team" },
      { title: "Attendance", url: "/attendance", icon: CalendarClock, keywords: "time log shifts" },
      { title: "Payroll", url: "/payroll", icon: BadgeDollarSign, keywords: "salary wages" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    items: [
      { title: "Reports", url: "/reports", icon: BarChart3, keywords: "statements export" },
      { title: "Analytics", url: "/analytics", icon: LineChart, keywords: "trends insights kpi" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    items: [
      { title: "Settings", url: "/settings", icon: Settings, keywords: "preferences access team" },
      {
        title: "Billing",
        url: "/billing",
        icon: CreditCard,
        keywords: "subscription plan invoice upgrade payment",
      },
      {
        title: "Upgrade Plan",
        url: "/upgrade",
        icon: Sparkles,
        keywords: "plan pro business promo code checkout",
      },
      { title: "Notifications", url: "/notifications", icon: Bell, keywords: "alerts" },

      { title: "Audit Logs", url: "/audit-logs", icon: ScrollText, keywords: "history trail" },
    ],
  },
];

export type Crumb = { label: string; url?: string };

/** Breadcrumb trail for any pathname, e.g. /products -> Inventory / Products. */
export function crumbsFor(pathname: string): Crumb[] {
  for (const group of NAV_GROUPS) {
    if (group.url && pathname === group.url) return [{ label: group.label }];
    const item = group.items.find((i) => pathname === i.url);
    if (item) return [{ label: group.label }, { label: item.title, url: item.url }];
    const nested = group.items.find((i) => pathname.startsWith(`${i.url}/`));
    if (nested)
      return [
        { label: group.label },
        { label: nested.title, url: nested.url },
        { label: "Details" },
      ];
  }
  const tail = pathname.split("/").filter(Boolean).pop() ?? "";
  if (!tail) return [{ label: "Dashboard" }];
  return [{ label: tail.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }];
}

/** Flat list of every navigable page (used by the command palette). */
export function flatNavItems(): (NavItem & { group: string })[] {
  return NAV_GROUPS.flatMap((g) =>
    g.url
      ? [{ title: g.label, url: g.url, icon: g.icon, group: g.label }]
      : g.items.map((i) => ({ ...i, group: g.label })),
  );
}
