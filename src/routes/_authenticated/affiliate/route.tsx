/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BarChart3,
  Handshake,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  Receipt,
  Settings,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

import { PortalShell, type PortalNavItem } from "@/components/portal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { applyAsAffiliate } from "@/lib/affiliate.functions";
import { useAffiliateStatus } from "@/lib/use-affiliate";

export const Route = createFileRoute("/_authenticated/affiliate")({
  component: AffiliateLayout,
});

const NAV: PortalNavItem[] = [
  { title: "Overview", url: "/affiliate", icon: BarChart3 },
  { title: "Referral link", url: "/affiliate/link", icon: Link2 },
  { title: "Referrals", url: "/affiliate/referrals", icon: Handshake },
  { title: "Customers", url: "/affiliate/customers", icon: Users },
  { title: "Commissions", url: "/affiliate/commissions", icon: Receipt },
  { title: "Payouts", url: "/affiliate/payouts", icon: Wallet },
  { title: "Promo codes", url: "/affiliate/promo-codes", icon: Ticket },
  { title: "Assets", url: "/affiliate/assets", icon: ImageIcon },
  { title: "Settings", url: "/affiliate/settings", icon: Settings },
];

function AffiliateLayout() {
  const { isPartner, application, loading, refetch } = useAffiliateStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOutPartner() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/affiliate/login", replace: true });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Partner portal access is gated on an *approved* partner record; the server
  // functions behind every page enforce the same rule through RLS.
  if (!isPartner)
    return (
      <div className="space-y-4">
        <ApplyScreen application={application} onApplied={refetch} />
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={signOutPartner}>
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </div>
    );

  return (
    <PortalShell label="Affiliate Partner Portal" tone="partner" items={NAV}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/dashboard">Workspace</a>
        </Button>
        <Button variant="ghost" size="sm" onClick={signOutPartner}>
          <LogOut className="mr-2 size-4" /> Sign out
        </Button>
      </div>
      <Outlet />
    </PortalShell>
  );
}

function ApplyScreen({ application, onApplied }: { application: any; onApplied: () => void }) {
  const apply = useServerFn(applyAsAffiliate);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    company: "",
    website: "",
    audience: "",
    motivation: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({
        data: {
          fullName: form.fullName,
          email: form.email,
          company: form.company || undefined,
          website: form.website || undefined,
          audience: form.audience || undefined,
          motivation: form.motivation || undefined,
        },
      });
      toast.success("Application submitted — we'll review it shortly.");
      onApplied();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit application");
    } finally {
      setBusy(false);
    }
  }

  if (application?.status === "pending") {
    return (
      <StatusCard
        badge="Under review"
        title="Your partner application is being reviewed"
        body="We review applications manually, usually within two business days. You'll get access to the partner portal as soon as you're approved."
      />
    );
  }
  if (application?.status === "rejected") {
    return (
      <StatusCard
        badge="Not approved"
        title="Your partner application wasn't approved"
        body={
          application.review_notes ??
          "You can apply again later with more detail about your audience."
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Card className="shadow-elevate-2">
        <CardHeader className="space-y-2">
          <Badge className="w-fit">Affiliate programme</Badge>
          <CardTitle className="font-display text-2xl">Become a Daraven partner</CardTitle>
          <p className="text-sm text-muted-foreground">
            Earn recurring commission on every business you bring to Daraven ERP. Commission is paid
            on collected subscription revenue — not on trials.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </Field>
              <Field label="Email" required>
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Company">
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </Field>
              <Field label="Website or social profile">
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://"
                />
              </Field>
            </div>
            <Field label="Who is your audience?">
              <Textarea
                rows={3}
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                placeholder="Retailers, restaurants, bookkeepers…"
              />
            </Field>
            <Field label="How will you promote Daraven?">
              <Textarea
                rows={3}
                value={form.motivation}
                onChange={(e) => setForm({ ...form, motivation: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="size-4 animate-spin" />} Submit application
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ badge, title, body }: { badge: string; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <Card className="text-center shadow-elevate-2">
        <CardContent className="space-y-3 py-12">
          <Badge variant="secondary" className="mx-auto w-fit">
            {badge}
          </Badge>
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{body}</p>
          <Button asChild variant="outline">
            <a href="/dashboard">Back to workspace</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
