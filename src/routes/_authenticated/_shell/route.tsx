import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, LogOut, Building2, Plus, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBusiness } from "@/lib/business-context";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { titleCase } from "@/lib/format";
import { canAccessRoute } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/_shell")({
  component: Shell,
});

function Shell() {
  const { loading, memberships, business, role, switchBusiness } = useBusiness();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const allowed = canAccessRoute(role, pathname);

  useEffect(() => {
    if (!loading && memberships.length === 0) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, memberships.length, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading || !business) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
            <SidebarTrigger />
            <div className="flex min-w-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="min-w-0 gap-2">
                    <Building2 className="size-4 shrink-0" />
                    <span className="truncate">{business.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel>Your businesses</DropdownMenuLabel>
                  {memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.business_id}
                      onClick={() => switchBusiness(m.business_id)}
                    >
                      <span className="truncate">{m.businesses?.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
                    <Plus className="size-4" /> New business
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {role && (
                <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                  {titleCase(role)}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {allowed ? (
              <Outlet />
            ) : (
              <div className="mx-auto max-w-md space-y-3 py-16 text-center">
                <ShieldAlert className="mx-auto size-10 text-muted-foreground" />
                <h1 className="font-display text-xl font-semibold">No access to this module</h1>
                <p className="text-sm text-muted-foreground">
                  Your role ({role ? titleCase(role) : "—"}) doesn&apos;t include this area. Ask a
                  business owner or admin to update your access in Settings.
                </p>
                <Button variant="outline" onClick={() => navigate({ to: "/settings" })}>
                  Go to settings
                </Button>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
