import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TEXT_FIELDS: { key: string; label: string; ph?: boolean }[] = [
  { key: "legal_name", label: "Registered legal name" },
  { key: "trade_name", label: "Trade name" },
  { key: "tin", label: "TIN" },
  { key: "rdo_code", label: "RDO code", ph: true },
  { key: "business_address", label: "Registered address" },
  { key: "pos_accreditation_no", label: "POS accreditation no.", ph: true },
  { key: "pos_ptu_no", label: "Permit to use (PTU) no.", ph: true },
  { key: "machine_id_no", label: "Machine ID (MIN)", ph: true },
  { key: "base_currency", label: "Base currency" },
  { key: "timezone", label: "Time zone" },
];

/** Legal / tax registration for the active business. Stored in business_compliance. */
export function ComplianceSettings() {
  const { businessId, isAdmin } = useBusiness();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["compliance", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("business_compliance")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Row;
    },
  });
  const { data: overrides } = useQuery({
    queryKey: ["costing-overrides", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [{ data: bs }, { count }] = await Promise.all([
        db
          .from("business_settings")
          .select("costing_method")
          .eq("business_id", businessId)
          .maybeSingle(),
        db
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .not("costing_method", "is", null),
      ]);
      return { method: bs?.costing_method as string | undefined, count: count ?? 0 };
    },
  });
  const [form, setForm] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(data ?? {}), [data]);

  const isPH = (form.jurisdiction ?? "PH") === "PH";

  async function save() {
    setSaving(true);
    const vat = form.vat_registration_type === "vat";
    const payload: Row = { business_id: businessId, jurisdiction: form.jurisdiction ?? "PH" };
    for (const f of TEXT_FIELDS) payload[f.key] = form[f.key] || null;
    payload.base_currency = form.base_currency || "PHP";
    payload.timezone = form.timezone || "Asia/Manila";
    payload.vat_registration_type = form.vat_registration_type ?? "non_vat";
    payload.is_vat_registered = vat;
    const { error } = await db.from("business_compliance").upsert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["compliance", businessId] });
    toast.success("Tax registration saved");
  }

  const methodLabel: Record<string, string> = {
    fifo: "FIFO (first in, first out)",
    weighted_average: "Weighted average",
    standard: "Standard cost",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tax registration and compliance</CardTitle>
        <p className="text-xs text-muted-foreground">
          Used on receipts, invoices, daily close and tax records. A business is treated as not
          VAT-registered until you change it here.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Country rules</Label>
          <Select
            disabled={!isAdmin}
            value={(form.jurisdiction ?? "PH") === "PH" ? "PH" : "OTHER"}
            onValueChange={(v) => setForm({ ...form, jurisdiction: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PH">Philippines</SelectItem>
              <SelectItem value="OTHER">Other (generic VAT/sales tax)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">VAT status</Label>
          <Select
            disabled={!isAdmin}
            value={form.vat_registration_type ?? "non_vat"}
            onValueChange={(v) => setForm({ ...form, vat_registration_type: v })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non_vat">Not VAT-registered</SelectItem>
              <SelectItem value="vat">VAT-registered</SelectItem>
              <SelectItem value="vat_exempt">VAT-exempt business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {TEXT_FIELDS.filter((f) => isPH || !f.ph).map((f) => (
          <div key={f.key} className="min-w-0">
            <Label className="text-xs">{f.label}</Label>
            <Input
              className="mt-1.5"
              disabled={!isAdmin}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
          <span>Stock costing:</span>
          <Badge variant="secondary">
            {methodLabel[overrides?.method ?? ""] ?? overrides?.method ?? "Not set"}
          </Badge>
          {overrides && overrides.count > 0 && (
            <span>{overrides.count} item(s) use their own costing method from the item page.</span>
          )}
        </div>
        <div className="sm:col-span-2">
          <Button onClick={save} disabled={saving || !isAdmin}>
            {saving ? "Saving..." : "Save tax registration"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
