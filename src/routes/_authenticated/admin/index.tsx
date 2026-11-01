import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  Coins,
  CreditCard,
  Handshake,
  TrendingUp,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { adminOverview } from "@/lib/platform-admin.functions";
import { peso } from "@/lib/partner-format";
import { db, type Row } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Platform Overview — Daraven ERP" },
      {
        name: "description",
        content: "Platform-wide revenue, trials, past-due workspaces and affiliate commissions.",
      },
      { property: "og:title", content: "Platform Overview — Daraven ERP" },
      {
        property: "og:description",
        content: "Platform-wide revenue, trials, past-due workspaces and affiliate commissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const fetchOverview = useServerFn(adminOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        description="Live health of the Daraven ERP business: tenants, revenue and partner performance."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="MRR" value={peso(data.mrr)} icon={TrendingUp} />
        <StatCard
          label="Affiliate MRR"
          value={peso(data.affiliateMrr)}
          hint={`${data.referredBusinesses} referred businesses`}
          icon={Handshake}
        />
        <StatCard label="Active subscriptions" value={data.activeSubscriptions} icon={CreditCard} />
        <StatCard label="Trials" value={data.trials} />
        <StatCard label="Businesses" value={data.businesses} icon={Building2} />
        <StatCard label="Users" value={data.users} icon={Users} />
        <StatCard
          label="Past due / unpaid"
          value={data.pastDue}
          hint="Needs dunning follow-up"
          icon={AlertTriangle}
        />
        <StatCard
          label="Commissions owed"
          value={peso(data.pendingCommissions)}
          hint="Pending + approved"
          icon={Coins}
        />
      </div>
      <SoftwareProviderSettings />
    </div>
  );
}

function SoftwareProviderSettings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Row>({});
  const settings = useQuery({
    queryKey: ["platform-software-provider"],
    queryFn: async () => {
      const { data, error } = await db
        .from("platform_settings")
        .select("value")
        .eq("key", "software_provider")
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as Row;
    },
  });
  useEffect(() => setForm(settings.data ?? {}), [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("platform_settings").upsert({
        key: "software_provider",
        value: {
          name: String(form.name ?? "").trim(),
          address: String(form.address ?? "").trim(),
          tin: String(form.tin ?? "").trim(),
          accreditation_details: String(form.accreditation_details ?? "").trim(),
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-software-provider"] });
      toast.success("Software provider details saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">CAS software provider details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {[
          ["name", "Provider name"],
          ["address", "Provider address"],
          ["tin", "Provider TIN"],
          ["accreditation_details", "Accreditation details"],
        ].map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`provider-${key}`}>{label}</Label>
            <Input
              id={`provider-${key}`}
              className="mt-1.5"
              value={form[key] ?? ""}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              disabled={settings.isLoading}
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <Button onClick={() => save.mutate()} disabled={settings.isLoading || save.isPending}>
            {save.isPending ? "Saving..." : "Save provider details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
