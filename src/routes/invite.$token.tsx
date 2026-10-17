/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { ROLE_LABEL } from "@/lib/permissions";
import { lovable } from "@/integrations/lovable/index";
import {
  APP_URL,
  buildInviteAuthRedirectUrl,
  invitationError,
  isInviteToken,
  PENDING_INVITE_KEY,
} from "@/lib/invite-links";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Join your team — Daraven ERP" },
      { name: "description", content: "Accept your invitation to join a Daraven ERP workspace." },
      { property: "og:title", content: "Join your team — Daraven ERP" },
      {
        property: "og:description",
        content: "Accept your invitation to join a Daraven ERP workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: InvitePage,
});

type Invite = {
  business_name: string;
  email: string;
  role: string;
  status: string;
  expired: boolean;
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookupError, setLookupError] = useState(false);

  useEffect(() => {
    let active = true;
    setInvite(undefined);
    setLookupError(false);
    if (isInviteToken(token)) {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
      (supabase as any)
        .rpc("get_team_invitation", { _token: token })
        .then(({ data, error }: any) => {
          if (!active) return;
          setLookupError(!!error);
          setInvite((data && data[0]) || null);
        })
        .catch(() => {
          if (active) {
            setLookupError(true);
            setInvite(null);
          }
        });
    } else {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      setInvite(null);
    }
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUserEmail(s?.user?.email ?? null),
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    try {
      const { data: businessId, error } = await db.rpc("accept_team_invitation", { _token: token });
      if (error) return toast.error(error.message);
      if (typeof businessId !== "string")
        throw new Error("Could not join the workspace. Please try again.");
      window.localStorage.setItem("kpioptiva-business", businessId);
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      toast.success(`Welcome to ${invite?.business_name}`);
      await navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("Could not join the workspace. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function auth(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
        if (error) toast.error(error.message);
        return;
      }

      const { data, error } = await supabase.functions.invoke("invite-signup", {
        body: { token, email: invite.email, password, fullName },
      });
      if (error) {
        let message = error.message;
        if (error.context instanceof Response) {
          const details = await error.context
            .clone()
            .json()
            .catch(() => null);
          if (details?.code === "account_exists") {
            setMode("signin");
            setPassword("");
          }
          message = details?.message ?? message;
        }
        toast.error(message);
        return;
      }
      if (!data?.session || typeof data.businessId !== "string") {
        toast.error("Could not finish joining this workspace. Please try again.");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) {
        toast.error("Your account joined the workspace. Sign in to continue.");
        return;
      }

      window.localStorage.setItem("kpioptiva-business", data.businessId);
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      window.location.replace(`${APP_URL}/dashboard`);
    } catch {
      toast.error("Could not finish account setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: buildInviteAuthRedirectUrl(token),
      });
      if (result.error) toast.error("Google sign-in failed. Please try again.");
      else if (!result.redirected) {
        const { data } = await supabase.auth.getUser();
        setUserEmail(data.user?.email ?? null);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const unusable = invitationError(invite ?? null);
  const wrongUser = invite && userEmail && userEmail.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <BrandLogo markClassName="size-10" />
        {invite === undefined || userEmail === undefined ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !invite ? (
          <p className="text-sm text-muted-foreground">
            {lookupError
              ? "Could not check this invitation. Please reload and try again."
              : "This invitation link is not valid."}
          </p>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold">Join {invite.business_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                You were invited as {ROLE_LABEL[invite.role] ?? invite.role} using {invite.email}.
                You won't need to set up your own business.
              </p>
            </div>
            {unusable ? (
              <p className="text-sm text-destructive">{unusable}</p>
            ) : wrongUser ? (
              <div className="space-y-3 text-sm">
                <p className="text-destructive">
                  You're signed in as {userEmail}. Sign out and continue with {invite.email}.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => supabase.auth.signOut()}
                >
                  Sign out
                </Button>
              </div>
            ) : userEmail ? (
              <Button className="w-full" onClick={accept} disabled={busy}>
                {busy ? "Joining..." : "Accept and join workspace"}
              </Button>
            ) : (
              <form className="space-y-4" onSubmit={auth}>
                <div>
                  <Label>Email</Label>
                  <Input value={invite.email} disabled className="mt-1.5" />
                </div>
                {mode === "signup" && (
                  <div>
                    <Label htmlFor="inv-name">Full name</Label>
                    <Input
                      id="inv-name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="inv-pass">
                    {mode === "signup" ? "Create your password" : "Password"}
                  </Label>
                  <Input
                    id="inv-pass"
                    type="password"
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Please wait..." : mode === "signup" ? "Create login" : "Sign in"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                >
                  {mode === "signup"
                    ? "Already have an account? Sign in"
                    : "New here? Create a login"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={google}
                >
                  Continue with Google
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
