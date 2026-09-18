import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Command } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useBusiness } from "@/lib/business-context";
import { canAccessRoute } from "@/lib/permissions";
import { NAV_GROUPS } from "@/lib/nav";
import { BrandMark } from "@/components/brand-logo";

export function AppSidebar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { role, feature } = useBusiness();

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canAccessRoute(role, i.url) && (!i.feature || feature(i.feature))),
  })).filter((g) => (g.url ? canAccessRoute(role, g.url) : g.items.length > 0));

  const activeGroup = groups.find((g) =>
    g.url ? pathname === g.url : g.items.some((i) => pathname.startsWith(i.url)),
  )?.id;

  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup ?? null);
  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup);
  }, [activeGroup]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-1 py-2">
          <BrandMark className="size-8 shrink-0 text-sidebar-foreground" />
          {!collapsed && (
            <div className="min-w-0 leading-none">
              <p className="truncate font-display text-sm font-semibold tracking-[0.16em]">
                DARA<span className="text-primary">V</span>EN
              </p>
              <p className="mt-1 truncate text-[9px] font-medium tracking-[0.4em] text-primary">
                ERP
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {groups.map((group) => {
                if (group.url) {
                  const active = pathname === group.url;
                  return (
                    <SidebarMenuItem key={group.id}>
                      <SidebarMenuButton asChild isActive={active} tooltip={group.label}>
                        <Link to={group.url} className="flex items-center gap-2">
                          <group.icon className="size-4 shrink-0" />
                          <span className="truncate">{group.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const isOpen = openGroup === group.id;
                const hasActive = group.items.some((i) => pathname.startsWith(i.url));

                if (collapsed) {
                  // In icon mode show the section's first page so the rail stays usable.
                  return (
                    <SidebarMenuItem key={group.id}>
                      <SidebarMenuButton asChild isActive={hasActive} tooltip={group.label}>
                        <Link to={group.items[0].url} className="flex items-center gap-2">
                          <group.icon className="size-4 shrink-0" />
                          <span className="truncate">{group.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <Collapsible
                    key={group.id}
                    open={isOpen}
                    onOpenChange={(o) => setOpenGroup(o ? group.id : null)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={hasActive && !isOpen} tooltip={group.label}>
                          <group.icon className="size-4 shrink-0" />
                          <span className="truncate">{group.label}</span>
                          <ChevronRight
                            className={`ml-auto size-4 shrink-0 transition-transform duration-200 ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                        <SidebarMenuSub>
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.url}>
                              <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                                <Link to={item.url} className="flex items-center gap-2">
                                  <item.icon className="size-3.5 shrink-0 opacity-70" />
                                  <span className="truncate">{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenPalette} tooltip="Search (⌘K)">
              <Command className="size-4 shrink-0" />
              <span className="truncate">Quick search</span>
              <kbd className="ml-auto rounded border border-sidebar-border px-1 text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
