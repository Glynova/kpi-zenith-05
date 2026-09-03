import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Daraven ERP" },
      { name: "description", content: "Access your Daraven ERP business workspace." },
      { property: "og:title", content: "Sign in — Daraven ERP" },
      { property: "og:description", content: "Access your Daraven ERP business workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (!data.session) {
      toast.success("Check your email to confirm your account.");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return toast.error("Google sign-in failed. Please try again.");
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  async function reset() {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-card p-12 lg:flex">
        <BrandLogo markClassName="size-10" />
        <div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight">
            Smarter Decisions. Better Performance.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Inventory, finance, payroll and KPI analytics for every business you run.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Enterprise-grade multi-tenant platform</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in or create your Daraven ERP account.
          </p>

          <Button variant="outline" className="mt-6 w-full" onClick={google}>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={signIn}>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={signUp}>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="email2">Email</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="password2">Password</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating..." : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
