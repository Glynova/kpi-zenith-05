/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePartnerProfile } from "@/lib/affiliate.functions";
import { usePartnerDashboard } from "@/lib/use-affiliate";

export const Route = createFileRoute("/_authenticated/affiliate/settings")({
  component: PartnerSettings,
});

const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "paypal", label: "PayPal" },
  { value: "wise", label: "Wise" },
];

function PartnerSettings() {
  const { data, isLoading, refetch } = usePartnerDashboard();
  const save = useServerFn(updatePartnerProfile);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    company: "",
    website: "",
    payoutMethod: "bank_transfer",
    accountName: "",
    accountNumber: "",
    bankName: "",
  });

  const partner = data?.partner as any;

  useEffect(() => {
    if (!partner) return;
    const d = (partner.payout_details ?? {}) as Record<string, string>;
    setForm({
      displayName: partner.display_name ?? "",
      email: partner.email ?? "",
      company: partner.company ?? "",
      website: partner.website ?? "",
      payoutMethod: partner.payout_method ?? "bank_transfer",
      accountName: d["accountName"] ?? "",
      accountNumber: d["accountNumber"] ?? "",
      bankName: d["bankName"] ?? "",
    });
  }, [partner]);

  if (isLoading || !partner) return <Skeleton className="h-96 w-full" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({
        data: {
          displayName: form.displayName,
          email: form.email,
          company: form.company || undefined,
          website: form.website || undefined,
          payoutMethod: form.payoutMethod,
          payoutDetails: {
            accountName: form.accountName,
            accountNumber: form.accountNumber,
            bankName: form.bankName,
          },
        },
      });
      toast.success("Partner profile updated");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partner settings"
        description="Your public details and where payouts should be sent."
      />
      <form onSubmit={submit} className="space-y-6">
        <Card className="shadow-elevate-1">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input
                required
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-elevate-1">
          <CardHeader>
            <CardTitle className="text-base">Payout details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select
                value={form.payoutMethod}
                onValueChange={(v) => setForm({ ...form, payoutMethod: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Account name</Label>
              <Input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account number</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bank / provider</Label>
              <Input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Commission rate <strong className="text-foreground">{partner.commission_rate}%</strong> ·
          duration{" "}
          <strong className="text-foreground capitalize">
            {String(partner.commission_duration ?? "").replace(/_/g, " ")}
          </strong>{" "}
          · payout threshold{" "}
          <strong className="text-foreground">₱{Number(partner.payout_threshold ?? 0)}</strong>.
          These are set by the Daraven team.
        </div>

        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save changes
        </Button>
      </form>
    </div>
  );
}
