import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingCart, Boxes, Landmark, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { useBusiness } from "@/lib/business-context";
import { canAccessRoute } from "@/lib/permissions";

const TABS = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Sales", url: "/sales", icon: ShoppingCart },
  { title: "Stock", url: "/products", icon: Boxes },
  { title: "Finance", url: "/expenses", icon: Landmark },
];

/**
 * Phone-only bottom navigation for the four highest-traffic areas plus a
 * "More" button that opens the same sidebar drawer (so nothing is unreachable).
 */
export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { setOpenMobile } = useSidebar();
  const { role } = useBusiness();

  const tabs = TABS.filter((t) => canAccessRoute(role, t.url));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex items-stretch [&>li]:min-w-0 [&>li]:flex-1">
        {tabs.map((t) => {
          const active = pathname === t.url || pathname.startsWith(`${t.url}/`);
          return (
            <li key={t.url}>
              <Link
                to={t.url}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-lg transition-colors",
                    active && "bg-primary/12",
                  )}
                >
                  <t.icon className="size-[18px]" />
                </span>
                <span className="truncate">{t.title}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium text-muted-foreground"
          >
            <span className="grid size-7 place-items-center rounded-lg">
              <Menu className="size-[18px]" />
            </span>
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
