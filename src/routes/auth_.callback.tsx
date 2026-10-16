import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { postAuthDestination } from "@/lib/post-auth";

export const Route = createFileRoute("/auth_/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Daraven ERP" },
      { name: "description", content: "Finishing sign-in to your Daraven ERP workspace." },
      { property: "og:title", content: "Signing you in — Daraven ERP" },
      { property: "og:description", content: "Finishing sign-in to your Daraven ERP workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;
    const go = async () => {
      if (done) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      done = true;
      const invite = sessionStorage.getItem("daraven_pending_invite");
      if (invite) {
        navigate({ to: "/invite/$token", params: { token: invite }, replace: true });
        return;
      }
      navigate({ to: await postAuthDestination(), replace: true });
    };
    void go();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void go();
    });
    const timeout = window.setTimeout(() => {
      if (!done) navigate({ to: "/auth", replace: true });
    }, 10000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" /> Signing you in…
    </div>
  );
}
