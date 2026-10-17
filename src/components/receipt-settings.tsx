import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { db } from "@/lib/db";
import type { Json } from "@/integrations/supabase/types";
import { useBusiness } from "@/lib/business-context";
import { DEFAULT_RECEIPT_SETTINGS, normalizeReceiptSettings } from "@/lib/receipt-settings";
import type { ReceiptSettings } from "@/lib/receipt-settings";
import { previewReceipt } from "@/lib/receipt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function SwitchSetting({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-card-border bg-muted-surface p-4">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ReceiptSettings() {
  const { business, businessId, currency, isAdmin, settings, refreshSettings } = useBusiness();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [saving, setSaving] = useState(false);

  const queryKey = ["business-receipt-settings", businessId] as const;
  const receiptQuery = useQuery({
    queryKey,
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("business_settings")
        .select("extra")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      const extra = asRecord(data?.extra);
      return {
        exists: !!data,
        extra,
        settings: normalizeReceiptSettings(extra.receipt_print),
      };
    },
  });

  useEffect(() => {
    if (receiptQuery.data) setDraft(receiptQuery.data.settings);
  }, [businessId, receiptQuery.data]);

  function update<K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!businessId || !isAdmin) return;
    setSaving(true);
    const extra = {
      ...(receiptQuery.data?.extra ?? {}),
      receipt_print: normalizeReceiptSettings(draft),
    } as Json;
    try {
      const result = receiptQuery.data?.exists
        ? await db.from("business_settings").update({ extra }).eq("business_id", businessId)
        : await db.from("business_settings").insert({ business_id: businessId, extra });
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey });
      refreshSettings();
      toast.success("Receipt settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save receipt settings");
    } finally {
      setSaving(false);
    }
  }

  async function preview() {
    if (!business) return;
    const subtotal = 100;
    const tax = 12;
    const total = subtotal + tax;
    const opened = await previewReceipt({
      business,
      sale: {
        sale_number: "PREVIEW-001",
        created_at: new Date().toISOString(),
        subtotal,
        discount: 0,
        tax,
        shipping: 0,
        total,
        paid: total,
      },
      items: [
        {
          product_name: "Receipt preview item",
          quantity: 1,
          unit_price: subtotal,
          total: subtotal,
        },
      ],
      payments: [{ method: "cash", amount: total, tendered: total }],
      customer: { name: "Sample customer" },
      currency,
      taxName: settings.tax_name ?? "Tax",
      receiptSettings: draft,
    });
    if (!opened) toast.error("Allow pop-ups to preview the receipt");
  }

  const marginFields: { key: keyof ReceiptSettings["margins"]; label: string }[] = [
    { key: "top", label: "Top" },
    { key: "right", label: "Right" },
    { key: "bottom", label: "Bottom" },
    { key: "left", label: "Left" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">POS receipt</CardTitle>
        <CardDescription>
          Configure thermal receipts printed after POS sales. A4 remains available for full-page
          invoices, not receipt rolls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {receiptQuery.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load saved receipt settings.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="receipt-width">Paper width</Label>
            <Select
              value={draft.paperWidth}
              disabled={!isAdmin || receiptQuery.isLoading}
              onValueChange={(value) =>
                update("paperWidth", value as ReceiptSettings["paperWidth"])
              }
            >
              <SelectTrigger id="receipt-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58 mm</SelectItem>
                <SelectItem value="80mm">80 mm</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {draft.paperWidth === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Custom paper width in millimeters"
                  type="number"
                  min={40}
                  max={120}
                  step={1}
                  value={draft.customWidthMm}
                  disabled={!isAdmin}
                  onChange={(event) => update("customWidthMm", Number(event.target.value))}
                />
                <span className="text-sm text-muted-foreground">mm</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Print format</Label>
            <div className="flex h-12 items-center rounded-2xl border border-card-border bg-muted-surface px-4 font-medium">
              Thermal receipt roll
            </div>
            <p className="text-sm text-muted-foreground">Use invoice printing for A4 pages.</p>
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="receipt-margins">Margins</Label>
            <Select
              value={draft.marginMode}
              disabled={!isAdmin}
              onValueChange={(value) =>
                update("marginMode", value as ReceiptSettings["marginMode"])
              }
            >
              <SelectTrigger id="receipt-margins">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Automatic</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="receipt-font">Font size</Label>
            <Select
              value={draft.fontSize}
              disabled={!isAdmin}
              onValueChange={(value) => update("fontSize", value as ReceiptSettings["fontSize"])}
            >
              <SelectTrigger id="receipt-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="large">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {draft.marginMode === "custom" && (
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
              {marginFields.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`receipt-margin-${key}`}>{label} margin (mm)</Label>
                  <Input
                    id={`receipt-margin-${key}`}
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={draft.margins[key]}
                    disabled={!isAdmin}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        margins: { ...current.margins, [key]: Number(event.target.value) },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchSetting
            title="Business logo"
            description={
              draft.showBusinessLogo
                ? "Show the saved business logo."
                : "Hide the logo on receipts."
            }
            checked={draft.showBusinessLogo}
            disabled={!isAdmin}
            onCheckedChange={(checked) => update("showBusinessLogo", checked)}
          />
          <SwitchSetting
            title="Tax details"
            description="Show the tax row when the sale has a tax amount."
            checked={draft.showTaxDetails}
            disabled={!isAdmin}
            onCheckedChange={(checked) => update("showTaxDetails", checked)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="receipt-footer">Receipt footer</Label>
          <Textarea
            id="receipt-footer"
            rows={3}
            maxLength={240}
            value={draft.footer}
            disabled={!isAdmin}
            onChange={(event) => update("footer", event.target.value)}
            placeholder="Thank you!"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={preview}
            disabled={receiptQuery.isLoading}
          >
            <Eye /> Preview
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!isAdmin || saving || receiptQuery.isLoading}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "Saving..." : "Save receipt settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
