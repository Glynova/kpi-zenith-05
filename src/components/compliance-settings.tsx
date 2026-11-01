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
  { key: "tin_branch_code", label: "TIN branch code", ph: true },
  { key: "rdo_code", label: "RDO code", ph: true },
  { key: "business_address", label: "Registered address" },
  { key: "pos_accreditation_no", label: "POS accreditation no.", ph: true },
  { key: "pos_ptu_no", label: "Permit to use (PTU) no.", ph: true },
  { key: "machine_id_no", label: "Machine ID (MIN)", ph: true },
  { key: "acknowledgement_certificate_no", label: "Acknowledgement Certificate no.", ph: true },
  { key: "base_currency", label: "Base currency" },
  { key: "timezone", label: "Time zone" },
];
const STATUTORY_DISCOUNTS = [
  ["senior_citizen", "Senior Citizen"],
  ["pwd", "Person with Disability"],
  ["athlete", "Athlete"],
  ["solo_parent", "Solo Parent"],
  ["other", "Other"],
] as const;

// TODO: Validate each category's rate and VAT treatment against current BIR issuances before enabling checkout.
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
  const discountRules =
    form.statutory_discount_rules && typeof form.statutory_discount_rules === "object"
      ? form.statutory_discount_rules
      : {};

  function updateStatutoryRule(
    type: string,
    key: "rate" | "vat_treatment" | "require_tin",
    value: string | number | boolean,
  ) {
    const current = (discountRules as Row)[type] ?? {};
    setForm({
      ...form,
      statutory_discount_rules: {
        ...discountRules,
        [type]: { ...current, [key]: value },
      },
    });
  }

  async function save() {
    setSaving(true);
    const vat = form.vat_registration_type === "vat";
    const payload: Row = { business_id: businessId, jurisdiction: form.jurisdiction ?? "PH" };
    for (const f of TEXT_FIELDS) payload[f.key] = form[f.key] || null;
    payload.base_currency = form.base_currency || "PHP";
    payload.timezone = form.timezone || "Asia/Manila";
    payload.vat_registration_type = form.vat_registration_type ?? "non_vat";
    payload.is_vat_registered = vat;
    payload.acknowledgement_certificate_date = form.acknowledgement_certificate_date || null;
    payload.invoice_title = form.invoice_title ?? "SALES INVOICE";
    payload.statutory_discount_rules = form.statutory_discount_rules ?? {};
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
        {isPH && (
          <>
            <div className="min-w-0">
              <Label className="text-xs">Acknowledgement Certificate date</Label>
              <Input
                className="mt-1.5"
                type="date"
                disabled={!isAdmin}
                value={form.acknowledgement_certificate_date ?? ""}
                onChange={(e) =>
                  setForm({ ...form, acknowledgement_certificate_date: e.target.value })
                }
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Printed document title</Label>
              <Select
                disabled={!isAdmin}
                value={form.invoice_title ?? "SALES INVOICE"}
                onValueChange={(invoice_title) => setForm({ ...form, invoice_title })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALES INVOICE">SALES INVOICE</SelectItem>
                  <SelectItem value="OFFICIAL RECEIPT">OFFICIAL RECEIPT</SelectItem>
                  <SelectItem value="THIS SERVES AS YOUR SALES INVOICE">
                    THIS SERVES AS YOUR SALES INVOICE
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium">Statutory discount configuration</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Rates are business-configured. VAT treatment is not automatically inferred; the
                exempt treatment currently requires every sale line to be classified as VAT-exempt.
              </p>
              <div className="space-y-3">
                {STATUTORY_DISCOUNTS.map(([type, label]) => {
                  const rule = ((discountRules as Row)[type] ?? {}) as Row;
                  return (
                    <div
                      key={type}
                      className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_140px_1fr_auto]"
                    >
                      <Label className="self-center text-xs">{label}</Label>
                      <div>
                        <Label className="text-[11px]">Discount rate (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          disabled={!isAdmin}
                          value={rule.rate ?? ""}
                          onChange={(event) =>
                            updateStatutoryRule(type, "rate", Number(event.target.value))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[11px]">VAT handling</Label>
                        <Select
                          disabled={!isAdmin}
                          value={rule.vat_treatment ?? "manual_review"}
                          onValueChange={(value) =>
                            updateStatutoryRule(type, "vat_treatment", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual_review">Manual legal review</SelectItem>
                            <SelectItem value="no_change">No tax change</SelectItem>
                            <SelectItem value="eligible_items_exempt">
                              Entire sale VAT-exempt (manual line classification)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          disabled={!isAdmin}
                          checked={rule.require_tin !== false}
                          onChange={(event) =>
                            updateStatutoryRule(type, "require_tin", event.target.checked)
                          }
                        />
                        Require TIN
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
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
