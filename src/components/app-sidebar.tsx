import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Tags,
  Truck,
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
  Layers,
  BarChart3,
  Bell,
  LineChart,
  Settings,
  ScrollText,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Analytics", url: "/analytics", icon: LineChart },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Products", url: "/products", icon: Package },
      { title: "Categories", url: "/categories", icon: Tags },
      { title: "Suppliers", url: "/suppliers", icon: Truck },
      { title: "Customers", url: "/customers", icon: Users },
      { title: "Bill of Materials", url: "/bill-of-materials", icon: Layers },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Inventory", url: "/inventory", icon: Boxes },
      { title: "Purchase Orders", url: "/purchase-orders", icon: ClipboardList },
      { title: "Sales", url: "/sales", icon: ShoppingCart },
      { title: "Invoices", url: "/invoices", icon: FileText },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Expenses", url: "/expenses", icon: Receipt },
      { title: "Cash Flow", url: "/cash-flow", icon: Wallet },
      { title: "Receivables", url: "/receivables", icon: ArrowDownLeft },
      { title: "Payables", url: "/payables", icon: ArrowUpRight },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Employees", url: "/employees", icon: UserCog },
      { title: "Attendance", url: "/attendance", icon: CalendarClock },
      { title: "Payroll", url: "/payroll", icon: BadgeDollarSign },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Audit Logs", url: "/audit-logs", icon: ScrollText },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold">
            K
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">KPIOptiva</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Smarter Decisions. Better Performance.
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="size-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
