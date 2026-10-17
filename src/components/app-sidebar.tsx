import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Command } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
import { BrandIdentity } from "@/components/brand-logo";

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
          <BrandIdentity compact={collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="h-8 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {groups.map((group) => {
                if (group.url) {
                  const active = pathname === group.url;
                  return (
                    <SidebarMenuItem key={group.id}>
                      <SidebarMenuButton asChild isActive={active} tooltip={group.label}>
                        <Link to={group.url} className="flex items-center gap-3">
                          <group.icon className="size-5 shrink-0" />
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
                        <Link to={group.items[0].url} className="flex items-center gap-3">
                          <group.icon className="size-5 shrink-0" />
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
                          <group.icon className="size-5 shrink-0" />
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
                                  <item.icon className="size-5 shrink-0 opacity-70" />
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
            <SidebarMenuButton
              onClick={onOpenPalette}
              tooltip="Search (⌘K)"
              className="rounded-full border border-sidebar-border bg-sidebar-accent/40"
            >
              <Command className="size-4 shrink-0" />
              <span className="truncate">Quick search</span>
              <kbd className="ml-auto rounded-full border border-sidebar-border px-2 py-0.5 text-xs text-muted-foreground">
                ⌘K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
