import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Handshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/affiliate/login")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Partner Sign in — Daraven Affiliates" },
      {
        name: "description",
        content:
          "Sign in to the Daraven affiliate partner portal to track referrals, commissions and payouts.",
      },
      { property: "og:title", content: "Partner Sign in — Daraven Affiliates" },
      {
        property: "og:description",
        content: "Sign in to the Daraven affiliate partner portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://daraven.com/affiliate/login" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/affiliate/login" }],
  }),
  component: AffiliateLoginPage,
});

/** Only same-origin affiliate paths may be used as a post-login destination. */
export function safeAffiliateRedirect(value?: string) {
  if (!value || !value.startsWith("/affiliate") || value.startsWith("//")) return "/affiliate";
  if (value.startsWith("/affiliate/login") || value.startsWith("/affiliate/signup"))
    return "/affiliate";
  return value;
}

function AffiliateLoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const target = safeAffiliateRedirect(search.redirect);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) navigate({ to: target, replace: true });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("Invalid email or password.");
      return;
    }
    // Portal access itself is decided server-side from the partner record.
    navigate({ to: target, replace: true });
  }

  async function sendReset() {
    if (!email) {
      setError("Enter your email first, then request a reset link.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError("Could not send the reset link. Try again shortly.");
      return;
    }
    toast.success("If that address is registered, a password reset link is on its way.");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-16">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLogo markClassName="size-10" />
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Handshake className="size-3.5" /> Affiliate Partner
          </div>
        </div>

        <Card className="shadow-elevate-2">
          <CardContent className="space-y-5 py-8">
            <div className="space-y-1 text-center">
              <h1 className="font-display text-2xl font-semibold">Partner sign in</h1>
              <p className="text-sm text-muted-foreground">
                Track referrals, commissions and payouts in the Daraven partner portal.
              </p>
            </div>

            {checking ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="partner-email">Email</Label>
                  <Input
                    id="partner-email"
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="partner-password">Password</Label>
                    <button
                      type="button"
                      onClick={sendReset}
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="partner-password"
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
                  Sign in to partner portal
                </Button>
              </form>
            )}

            <div className="space-y-1 border-t pt-4 text-center text-xs text-muted-foreground">
              <p>
                New partner?{" "}
                <a
                  href="/affiliate/signup"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Apply to the programme
                </a>
              </p>
              <p>
                Looking for your workspace?{" "}
                <a href="/auth" className="text-primary underline-offset-4 hover:underline">
                  Go to workspace sign-in
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
