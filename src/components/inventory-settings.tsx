/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";

import { db } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import {
  BUSINESS_TYPES,
  COSTING_METHODS,
  FEATURE_GROUPS,
  defaultsForType,
  type FeatureKey,
} from "@/lib/business-config";
import {
  CAPABILITY_USED_BY,
  capabilityLabel,
  capabilityStatus,
  configurationHealth,
  dependentsOf,
  withPrerequisites,
} from "@/lib/capabilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Business profile + inventory configuration. Business type only recommends
 * defaults — every capability stays editable by the owner.
 */
export function InventorySettings() {
  const { business, businessId, isAdmin, settings, refresh, refreshSettings } = useBusiness();
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>(business?.type ?? "other");
  const [config, setConfig] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setType(business?.type ?? "other");
  }, [business?.type]);

  useEffect(() => {
    setConfig({ ...settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.business_id, business?.type]);

  const flag = (key: FeatureKey) => config[key] ?? settings[key] ?? false;

  const health = configurationHealth(config as any);

  /** Turning a capability on pulls in its prerequisites; turning it off turns
   *  off whatever depends on it, so a broken combination cannot be saved. */
  function toggle(key: FeatureKey, value: boolean) {
    if (value) {
      setConfig({ ...config, ...withPrerequisites(config as any, key) });
      return;
    }
    const next: Record<string, any> = { ...config, [key]: false };
    for (const dep of dependentsOf(key)) next[dep] = false;
    setConfig(next);
  }

  function applyRecommended() {
    setConfig({ ...config, ...defaultsForType(type) });
    toast.info("Recommended settings loaded — review and save.");
  }


  async function save() {
    if (!isAdmin) return toast.error("Only owners and admins can change configuration");
    setSaving(true);
    const payload: Record<string, any> = { business_id: businessId };
    FEATURE_GROUPS.flatMap((g) => g.items).forEach((i) => (payload[i.key] = !!flag(i.key)));
    payload.costing_method = config.costing_method ?? settings.costing_method;
    payload.low_stock_rule = config.low_stock_rule ?? settings.low_stock_rule;
    payload.expiry_alert_days =
      Number(config.expiry_alert_days ?? settings.expiry_alert_days) || 30;
    payload.enable_alerts = config.enable_alerts ?? settings.enable_alerts ?? true;
    payload.po_approval_threshold =
      Number(config.po_approval_threshold ?? settings.po_approval_threshold ?? 0) || 0;
    payload.discount_limit_percent =
      Number(config.discount_limit_percent ?? settings.discount_limit_percent ?? 0) || 0;

    const { error: typeError } = await db.from("businesses").update({ type }).eq("id", businessId);
    const { error } = await db
      .from("business_settings")
      .upsert(payload, { onConflict: "business_id" });
    setSaving(false);
    if (typeError || error) return toast.error((typeError ?? error)!.message);
    refresh();
    refreshSettings();
    queryClient.invalidateQueries({ queryKey: ["memberships"] });
    toast.success("Inventory configuration saved");
  }

  const selected = BUSINESS_TYPES.find((t) => t.value === type);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business profile</CardTitle>
          <CardDescription>
            Your business type suggests a starting configuration. You can change anything below.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Label className="text-xs">Business type</Label>
            <Select value={type} onValueChange={setType} disabled={!isAdmin}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && <p className="mt-1.5 text-xs text-muted-foreground">{selected.summary}</p>}
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Costing method</Label>
            <Select
              value={config.costing_method ?? settings.costing_method}
              onValueChange={(v) => setConfig({ ...config, costing_method: v })}
              disabled={!isAdmin}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COSTING_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {
                COSTING_METHODS.find(
                  (m) => m.value === (config.costing_method ?? settings.costing_method),
                )?.description
              }
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={applyRecommended}
              disabled={!isAdmin}
            >
              <Wand2 className="size-4" /> Load recommended settings for this business type
            </Button>
          </div>
        </CardContent>
      </Card>

      {FEATURE_GROUPS.map((group) => (
        <Card key={group.label}>
          <CardHeader>
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {group.items.map((item) => {
              const status = capabilityStatus(config as any, item.key);
              const usedBy = CAPABILITY_USED_BY[item.key] ?? [];
              return (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                    {usedBy.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Used by: {usedBy.join(", ")}
                      </p>
                    )}
                    {status.enabled && status.missing.length > 0 && (
                      <p className="mt-1 text-[11px] font-medium text-destructive">
                        Needs {status.missing.map(capabilityLabel).join(" and ")}
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={!!flag(item.key)}
                    disabled={!isAdmin}
                    onCheckedChange={(v: boolean) => toggle(item.key, v)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {health.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Configuration health</CardTitle>
            <CardDescription>
              These are switched on but cannot work until what they depend on is switched on too.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.map((h) => (
              <div
                key={h.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <span>
                  <span className="font-medium">{h.label}</span> needs{" "}
                  {h.missing.map(capabilityLabel).join(" and ")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isAdmin}
                  onClick={() => toggle(h.key, true)}
                >
                  Fix it
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}



      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Label className="text-xs">Low stock rule</Label>
            <Select
              value={config.low_stock_rule ?? settings.low_stock_rule}
              onValueChange={(v) => setConfig({ ...config, low_stock_rule: v })}
              disabled={!isAdmin}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reorder_level">Below reorder level</SelectItem>
                <SelectItem value="min_stock">Below minimum stock</SelectItem>
                <SelectItem value="zero">Only when out of stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Expiry alert (days before)</Label>
            <Input
              className="mt-1.5"
              type="number"
              disabled={!isAdmin}
              value={config.expiry_alert_days ?? settings.expiry_alert_days}
              onChange={(e) => setConfig({ ...config, expiry_alert_days: e.target.value })}
            />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 sm:col-span-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Automatic alerts</p>
              <p className="text-xs text-muted-foreground">
                Create notifications for low stock, pending approvals and overdue payments.
              </p>
            </div>
            <Switch
              checked={config.enable_alerts ?? settings.enable_alerts ?? true}
              disabled={!isAdmin}
              onCheckedChange={(v: boolean) => setConfig({ ...config, enable_alerts: v })}
            />
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Purchase order approval threshold</Label>
            <Input
              className="mt-1.5"
              type="number"
              step="any"
              disabled={!isAdmin}
              value={config.po_approval_threshold ?? settings.po_approval_threshold ?? 0}
              onChange={(e) => setConfig({ ...config, po_approval_threshold: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Orders at or above this total must be submitted for approval first. 0 disables the
              rule.
            </p>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Maximum discount without approval (%)</Label>
            <Input
              className="mt-1.5"
              type="number"
              step="any"
              disabled={!isAdmin}
              value={config.discount_limit_percent ?? settings.discount_limit_percent ?? 0}
              onChange={(e) => setConfig({ ...config, discount_limit_percent: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Bigger discounts are blocked unless an owner, admin or manager records the sale. 0
              disables the rule.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={saving || !isAdmin}>
              {saving ? "Saving..." : "Save configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
