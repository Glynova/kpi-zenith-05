import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Building2,
  CreditCard,
  Handshake,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Tag,
  Users,
  Wallet,
} from "lucide-react";

import { PortalShell, type PortalNavItem } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAdminSession, logAdminAuthEvent } from "@/lib/platform-auth.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const NAV: PortalNavItem[] = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard },
  { title: "Businesses", url: "/admin/businesses", icon: Building2 },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Subscriptions", url: "/admin/subscriptions", icon: CreditCard },
  { title: "Affiliates", url: "/admin/affiliates", icon: Handshake },
  { title: "Payouts", url: "/admin/payouts", icon: Wallet },
  { title: "Promo codes", url: "/admin/promo-codes", icon: Tag },
  { title: "Activity", url: "/admin/activity", icon: Activity },
];

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchSession = useServerFn(getPlatformAdminSession);
  const logEvent = useServerFn(logAdminAuthEvent);

  // Re-verified server-side on an interval and on focus so that revoking
  // platform-admin access ends an already-open admin session.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-admin-session"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
    queryFn: () => fetchSession(),
  });

  // Expired/invalid session (token no longer valid) → back to admin sign-in.
  useEffect(() => {
    if (isError) navigate({ to: "/admin/login", replace: true });
  }, [isError, navigate]);

  const denied = !isLoading && data && !data.isPlatformAdmin;

  useEffect(() => {
    if (!denied) return;
    void logEvent({
      data: { action: "admin_access_denied", success: false, path: pathname },
    });
  }, [denied, logEvent, pathname]);


  async function signOutAdmin() {
    void logEvent({ data: { action: "admin_logout", success: true } });
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Every admin server function re-verifies platform admin server-side; this
  // check only decides what the UI offers.
  if (denied) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Card className="text-center shadow-elevate-2">
          <CardContent className="space-y-3 py-12">
            <ShieldAlert className="mx-auto size-8 text-destructive" />
            <h1 className="font-display text-xl font-semibold">Platform admins only</h1>
            <p className="text-sm text-muted-foreground">
              This area is restricted to the Daraven platform team. Your account is not authorized.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild variant="outline">
                <a href="/dashboard">Back to workspace</a>
              </Button>
              <Button asChild>
                <a href="/admin/login">Admin sign-in</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PortalShell label="Platform Admin" tone="admin" items={NAV}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/dashboard">Back to workspace</a>
        </Button>
        <Button variant="ghost" size="sm" onClick={signOutAdmin}>
          <LogOut className="mr-2 size-4" /> Sign out
        </Button>
      </div>
      <Outlet />
    </PortalShell>
  );
}
