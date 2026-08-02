import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { Switch } from "@/components/ui/switch";
import { TeamAccess } from "@/components/team-access";
import { InventorySettings } from "@/components/inventory-settings";

export const Route = createFileRoute("/_authenticated/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — KPIOptiva" },
      { name: "description", content: "Customize business branding, currency, tax and appearance." },
      { property: "og:title", content: "Settings — KPIOptiva" },
      { property: "og:description", content: "Customize business branding, currency, tax and appearance." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { business, businessId, isAdmin, memberships, role } = useBusiness();
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const value = (key: string) => form[key] ?? String(business?.[key] ?? "");

  async function save() {
    if (!isAdmin) return toast.error("Only owners and admins can change settings");
    setSaving(true);
    const { error } = await db
      .from("businesses")
      .update({
        name: value("name"),
        currency: value("currency"),
        tax_rate: Number(value("tax_rate")) || 0,
        timezone: value("timezone"),
        logo_url: value("logo_url") || null,
        phone: value("phone") || null,
        email: value("email") || null,
        address: value("address") || null,
        invoice_terms: value("invoice_terms") || null,
      })
      .eq("id", businessId);
    setSaving(false);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Settings saved");
  }

  const fields = [
    { key: "name", label: "Business name" },
    { key: "currency", label: "Currency" },
    { key: "tax_rate", label: "Tax rate (%)" },
    { key: "timezone", label: "Timezone" },
    { key: "logo_url", label: "Logo URL" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "invoice_terms", label: "Invoice terms" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Business profile, appearance and team access." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <Label htmlFor={f.key} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={f.key}
                className="mt-1.5"
                disabled={!isAdmin}
                value={value(f.key)}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={saving || !isAdmin}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <InventorySettings />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Dark mode</p>
            <p className="text-xs text-muted-foreground">Switch between light and dark themes.</p>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Your role in this business</span>
            <Badge variant="secondary">{role ? titleCase(role) : "—"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Businesses you belong to</span>
            <span className="font-medium">{memberships.length}</span>
          </div>
          {businessId && <TeamAccess businessId={businessId} canManage={isAdmin} />}
        </CardContent>
      </Card>
    </div>
  );
}
