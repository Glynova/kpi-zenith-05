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
import { CapabilityBlocked, useRouteCapability } from "@/components/capability-guard";
import { capabilityLabel } from "@/lib/capabilities";


export const Route = createFileRoute("/_authenticated/_shell")({
  component: Shell,
});

function Shell() {
  const {
    loading,
    memberships,
    business,
    role,
    switchBusiness,
    onboarding,
    onboardingLoaded,
    isAdmin,
  } = useBusiness();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const allowed = canAccessRoute(role, pathname);
  const capability = useRouteCapability(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

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
      <div className="min-h-screen p-6 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-9 w-48 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const initials = (business.name ?? "D").slice(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/85 px-2 py-2 backdrop-blur-xl sm:gap-3 sm:px-3">
            <SidebarTrigger className="shrink-0" />
            <div className="flex min-w-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0 gap-2 rounded-xl border border-transparent px-2 hover:border-border"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-[10px] font-semibold tracking-wide text-primary">
                      {initials}
                    </span>
                    <span className="truncate font-medium">{business.name}</span>
                    <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Your businesses
                  </DropdownMenuLabel>
                  {memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.business_id}
                      onClick={() => switchBusiness(m.business_id)}
                      className="gap-2"
                    >
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
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
                <Badge variant="secondary" className="hidden shrink-0 lg:inline-flex">
                  {titleCase(role)}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="hidden gap-2 rounded-xl text-muted-foreground lg:inline-flex"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-4" />
                <span>Search</span>
                <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search"
              >
                <Search className="size-4" />
              </Button>
              <AlertBell />
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account menu">
                    <span className="grid size-7 place-items-center rounded-full border border-border bg-muted/50">
                      <User className="size-4" />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="min-w-0">
                    <p className="truncate text-sm font-medium">{email ?? "Signed in"}</p>
                    {role && (
                      <p className="truncate text-xs font-normal text-muted-foreground">
                        {titleCase(role)} · {business.name}
                      </p>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                    <SettingsIcon className="size-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/billing" })}>
                    <CreditCard className="size-4" /> Billing
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <SubscriptionBanner />
          <div className="border-b border-border/60 bg-background/60 px-4 py-2 sm:px-6 lg:px-8">
            <Breadcrumbs />
          </div>
          <main className="flex-1 p-4 pb-24 sm:p-6 lg:p-8 md:pb-8">
            {allowed && entitled && capability.allowed ? (
              <div className="page-enter">
                <Outlet />
              </div>
            ) : allowed && entitled && !capability.allowed ? (
              <CapabilityBlocked
                capability={capability.key ? capabilityLabel(capability.key) : "This module"}
                missing={capability.missing}
              />
            ) : allowed && requiredFeature ? (
              <div className="py-10">
                <UpgradePrompt
                  feature={requiredFeature}
                  plan={
                    [
                      "multi_branch",
                      "advanced_permissions",
                      "consolidated_reports",
                      "api_access",
                    ].includes(requiredFeature)
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
      <MobileBottomNav />

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onSignOut={signOut} />
    </SidebarProvider>
  );
}
