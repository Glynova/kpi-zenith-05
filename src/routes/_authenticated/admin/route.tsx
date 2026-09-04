import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  Building2,
  LayoutDashboard,
  ShieldAlert,
  Users,
} from "lucide-react";


import { PortalShell, type PortalNavItem } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformAdmin } from "@/lib/use-affiliate";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const NAV: PortalNavItem[] = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard },
  { title: "Businesses", url: "/admin/businesses", icon: Building2 },
  { title: "Users", url: "/admin/users", icon: Users },
];


function AdminLayout() {
  const { isPlatformAdmin, loading } = usePlatformAdmin();

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Every admin server function re-verifies platform admin server-side; this
  // check only decides what the UI offers.
  if (!isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Card className="text-center shadow-elevate-2">
          <CardContent className="space-y-3 py-12">
            <ShieldAlert className="mx-auto size-8 text-destructive" />
            <h1 className="font-display text-xl font-semibold">Platform admins only</h1>
            <p className="text-sm text-muted-foreground">
              This area is restricted to the Daraven platform team.
            </p>
            <Button asChild variant="outline">
              <a href="/dashboard">Back to workspace</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PortalShell label="Platform Admin" tone="admin" items={NAV}>
      <Outlet />
    </PortalShell>
  );
}
