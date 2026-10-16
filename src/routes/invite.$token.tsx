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

export const PENDING_INVITE_KEY = "daraven_pending_invite";

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
    ],
  }),
  component: InvitePage,
});

type Invite = { business_name: string; email: string; role: string; status: string; expired: boolean };

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(PENDING_INVITE_KEY, token);
    (supabase as any).rpc("get_team_invitation", { _token: token }).then(({ data }: any) => {
      setInvite((data && data[0]) || null);
    });
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUserEmail(s?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [token]);

  async function accept() {
    setBusy(true);
    const { error } = await db.rpc("accept_team_invitation", { _token: token });
    setBusy(false);
    if (error) return toast.error(error.message);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    toast.success(`Welcome to ${invite?.business_name}`);
    navigate({ to: "/dashboard", replace: true });
  }

  async function auth(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
      setBusy(false);
      if (error) toast.error(error.message);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) toast.success("Check your email to confirm, then open the link to join.");
  }

  const unusable =
    invite &&
    (invite.status !== "pending" ? (invite.status === "accepted" ? "This invitation was already used." : "This invitation was cancelled.") : invite.expired ? "This invitation has expired. Ask the workspace owner for a new link." : null);
  const wrongUser =
    invite && userEmail && userEmail.toLowerCase() !== invite.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <BrandLogo markClassName="size-10" />
        {invite === undefined || userEmail === undefined ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : !invite ? (
          <p className="text-sm text-muted-foreground">This invitation link is not valid.</p>
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
                <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>
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
                    <Input id="inv-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5" />
                  </div>
                )}
                <div>
                  <Label htmlFor="inv-pass">{mode === "signup" ? "Create your password" : "Password"}</Label>
                  <Input id="inv-pass" type="password" required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Please wait..." : mode === "signup" ? "Create login" : "Sign in"}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                >
                  {mode === "signup" ? "Already have an account? Sign in" : "New here? Create a login"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
