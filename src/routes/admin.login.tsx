import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  bootstrapPlatformAdmin,
  getPlatformAdminSession,
  logAdminAuthEvent,
} from "@/lib/platform-auth.functions";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Platform Admin Sign in — Daraven" },
      {
        name: "description",
        content: "Restricted sign-in for the Daraven platform administration portal.",
      },
      { property: "og:title", content: "Platform Admin Sign in — Daraven" },
      {
        property: "og:description",
        content: "Restricted sign-in for the Daraven platform administration portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLoginPage,
});

/** Only same-origin admin paths may be used as a post-login destination. */
function safeRedirect(value?: string) {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin";
  if (value.startsWith("/admin/login")) return "/admin";
  return value;
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const target = safeRedirect(search.redirect);

  const checkSession = useServerFn(getPlatformAdminSession);
  const logEvent = useServerFn(logAdminAuthEvent);
  const claim = useServerFn(bootstrapPlatformAdmin);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  // If a session already exists, resolve authorization server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setChecking(false);
        return;
      }
      try {
        const session = await checkSession();
        if (cancelled) return;
        if (session.isPlatformAdmin) {
          navigate({ to: target, replace: true });
          return;
        }
        setSignedInEmail(session.email ?? data.user.email ?? null);
        setNeedsBootstrap(session.needsBootstrap);
        setError(
          session.needsBootstrap
            ? null
            : "This account is signed in but is not authorized for the platform admin portal.",
        );
      } catch {
        setError("Could not verify platform admin access. Please sign in again.");
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkSession, navigate, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError("Invalid email or password.");
      void logEvent({
        data: { action: "admin_login_failed", success: false, email, reason: "bad_credentials" },
      });
      return;
    }

    try {
      const session = await checkSession();
      if (!session.isPlatformAdmin) {
        setSignedInEmail(session.email ?? email);
        setNeedsBootstrap(session.needsBootstrap);
        void logEvent({
          data: {
            action: "admin_access_denied",
            success: false,
            email,
            reason: "not_platform_admin",
            path: target,
          },
        });
        if (!session.needsBootstrap) {
          await supabase.auth.signOut();
          setError("This account is not authorized for the platform admin portal.");
        }
        setLoading(false);
        return;
      }
      void logEvent({ data: { action: "admin_login_success", success: true, email, path: target } });
      toast.success("Welcome back, admin.");
      navigate({ to: target, replace: true });
    } catch {
      setLoading(false);
      setError("Could not verify platform admin access. Please try again.");
    }
  }

  async function claimPlatform() {
    setLoading(true);
    try {
      await claim({ data: { token: token || undefined } });
      toast.success("Platform admin access granted.");
      navigate({ to: target, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bootstrap failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-16">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLogo markClassName="size-10" />
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" /> Platform Admin
          </div>
        </div>

        <Card className="shadow-elevate-2">
          <CardContent className="space-y-5 py-8">
            <div className="space-y-1 text-center">
              <h1 className="font-display text-2xl font-semibold">Restricted sign-in</h1>
              <p className="text-sm text-muted-foreground">
                For the Daraven platform team. Workspace accounts cannot access this portal.
              </p>
            </div>

            {checking ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : needsBootstrap ? (
              <div className="space-y-4">
                <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  No platform administrator exists yet. Signed in as{" "}
                  <span className="font-medium">{signedInEmail}</span> — claim platform
                  administration for this account.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="token">Bootstrap token (only if admins already exist)</Label>
                  <Input
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button className="w-full" disabled={loading} onClick={claimPlatform}>
                  {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Claim platform admin access
                </Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Work email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@daraven.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Sign in to admin portal
                </Button>
              </form>
            )}

            <div className="border-t pt-4 text-center text-xs text-muted-foreground">
              Not platform staff?{" "}
              <a href="/auth" className="text-primary underline-offset-4 hover:underline">
                Go to workspace sign-in
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
