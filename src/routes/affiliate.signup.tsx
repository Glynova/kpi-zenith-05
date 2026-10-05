import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Handshake, Loader2, MailCheck } from "lucide-react";
import { z } from "zod";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/affiliate/signup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Become a Partner — Daraven Affiliates" },
      {
        name: "description",
        content:
          "Create a Daraven affiliate account and apply to earn recurring commission on every business you refer.",
      },
      { property: "og:title", content: "Become a Partner — Daraven Affiliates" },
      {
        property: "og:description",
        content: "Create a Daraven affiliate account and apply to the partner programme.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://daraven.com/affiliate/signup" },
    ],
    links: [{ rel: "canonical", href: "https://daraven.com/affiliate/signup" }],
  }),
  component: AffiliateSignupPage,
});

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  fullName: z.string().min(2, "Enter your full name."),
});

function AffiliateSignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) navigate({ to: "/affiliate", replace: true });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/affiliate`,
        data: { full_name: parsed.data.fullName },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // With email confirmation on, signUp returns no session — never treat this
    // as signed in. Approval into the programme is a separate, manual step.
    if (data.session) navigate({ to: "/affiliate", replace: true });
    else setSent(true);
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
            {sent ? (
              <div className="space-y-3 py-6 text-center">
                <MailCheck className="mx-auto size-8 text-primary" />
                <h1 className="font-display text-xl font-semibold">Confirm your email</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to <span className="font-medium">{form.email}</span>.
                  Confirm it, sign in, then complete your partner application — a Daraven reviewer
                  approves partners before the portal unlocks.
                </p>
                <Button asChild variant="outline" className="mt-2">
                  <a href="/affiliate/login">Back to partner sign-in</a>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1 text-center">
                  <h1 className="font-display text-2xl font-semibold">Become a partner</h1>
                  <p className="text-sm text-muted-foreground">
                    Create your account, then submit a short application. Approved partners earn
                    recurring commission on every business they refer.
                  </p>
                </div>

                {checking ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={submit}>
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full name</Label>
                      <Input
                        id="signup-name"
                        required
                        autoComplete="name"
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        required
                        autoComplete="username"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                    </div>
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Create partner account
                    </Button>
                  </form>
                )}

                <div className="border-t pt-4 text-center text-xs text-muted-foreground">
                  Already a partner?{" "}
                  <a
                    href="/affiliate/login"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Sign in
                  </a>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
