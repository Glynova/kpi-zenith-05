import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Moon,
  Sun,
  LogOut,
  Building2,
  Plus,
  ShieldAlert,
  Search,
  User,
  Settings as SettingsIcon,
  CreditCard,
  ChevronsUpDown,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommandPalette } from "@/components/command-palette";
import { AlertBell } from "@/components/alert-bell";
import { MobileBottomNav } from "@/components/mobile-nav";
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
import { ROUTE_FEATURE } from "@/lib/billing";
import { useSubscription } from "@/lib/use-subscription";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { SubscriptionBanner } from "@/components/subscription-banner";

export const Route = createFileRoute("/_authenticated/_shell")({
  component: Shell,
});


function Shell() {
  const { loading, memberships, business, role, switchBusiness, onboarding, onboardingLoaded, isAdmin } =
    useBusiness();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const allowed = canAccessRoute(role, pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Role decides *who* may open a module; the subscription decides *whether*
  // the business has the capability at all.
  const billing = useSubscription();
  const requiredFeature = ROUTE_FEATURE[pathname];
  const entitled = !requiredFeature || billing.loading || billing.can(requiredFeature);


  useEffect(() => {
    if (!loading && memberships.length === 0) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    if (!loading && onboardingLoaded && isAdmin && !onboarding?.completed) {
      navigate({ to: "/setup", replace: true });
    }
  }, [loading, memberships.length, navigate, onboardingLoaded, onboarding?.completed, isAdmin]);


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
        <AppSidebar onOpenPalette={() => setPaletteOpen(true)} />
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
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-2 text-muted-foreground sm:inline-flex"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-4" />
                <span>Search</span>
                <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
              >
                <Search className="size-4" />
              </Button>
              <AlertBell />
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <SubscriptionBanner />
          <div className="border-b border-border/60 bg-background/60 px-4 py-2 sm:px-6 lg:px-8">
            <Breadcrumbs />
          </div>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {allowed && entitled ? (
              <div className="page-enter">
                <Outlet />
              </div>
            ) : allowed && requiredFeature ? (
              <div className="py-10">
                <UpgradePrompt
                  feature={requiredFeature}
                  plan={
                    ["multi_branch", "advanced_permissions", "consolidated_reports", "api_access"].includes(
                      requiredFeature,
                    )
                      ? "Business"
                      : "Pro"
                  }
                />
              </div>
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
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onSignOut={signOut} />
    </SidebarProvider>
  );
}
