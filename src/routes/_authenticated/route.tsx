import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { BusinessProvider } from "@/lib/business-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Admin portal has its own restricted sign-in; keep the intended path.
      if (location.pathname.startsWith("/admin")) {
        throw redirect({ to: "/admin/login", search: { redirect: location.href } });
      }
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => (
    <BusinessProvider>
      <Outlet />
    </BusinessProvider>
  ),
});
