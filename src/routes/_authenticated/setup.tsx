/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import { db } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import {
  BUSINESS_TYPES,
  COSTING_METHODS,
  COSTING_PLAIN,
  COUNTRIES,
  CURRENCIES,
  DEFAULT_PRODUCT_CAPABILITIES,
  FEATURE_GROUPS,
  PRODUCT_CAPABILITIES,
  STARTER_CONVERSIONS,
  STARTER_UNITS,
  TRACK_ITEMS,
  WIZARD_LOCATION_TYPES,
  defaultsForType,
  type CostingMethod,
  type FeatureKey,
  type ProductCapability,
} from "@/lib/business-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Business Setup — Daraven ERP" },
      {
        name: "description",
        content: "Set up Daraven ERP around how your business actually tracks stock, costs and sales.",
      },
      { property: "og:title", content: "Business Setup — Daraven ERP" },
      {
        property: "og:description",
        content: "Set up Daraven ERP around how your business actually tracks stock, costs and sales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupWizard,
});

const STEPS = [
  "Business",
  "Tracking",
  "Inventory",
  "Locations",
  "Units",
  "Costing",
  "Products",
  "Review",
];

type LocationDraft = { name: string; type: string; address: string };

type Draft = {
  name: string;
  type: string;
  industry: string;
  country: string;
  currency: string;
  timezone: string;
  tracks: string[];
  features: Partial<Record<FeatureKey, boolean>>;
  locationMode: "one" | "many";
  locations: LocationDraft[];
  units: string[];
  conversions: { from_unit: string; to_unit: string; factor: number }[];
  costing: CostingMethod;
  capabilities: Record<string, boolean>;
};

const BASIC_INVENTORY: FeatureKey[] = [
  "track_quantity",
  "track_cost",
  "enable_low_stock_alerts",
  "enable_stock_counts",
  "enable_purchasing",
  "enable_sales",
];

const ADVANCED_INVENTORY: FeatureKey[] = FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.key)).filter(
  (k) => !BASIC_INVENTORY.includes(k),
);

const FEATURE_META = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]),
) as Record<FeatureKey, { key: FeatureKey; label: string; hint: string }>;

function emptyDraft(): Draft {
  return {
    name: "",
    type: "retail",
    industry: "",
    country: "PH",
    currency: "PHP",
    timezone: "Asia/Manila",
    tracks: ["products"],
    features: { ...defaultsForType("retail") } as Partial<Record<FeatureKey, boolean>>,
    locationMode: "one",
    locations: [{ name: "Main Store", type: "store", address: "" }],
    units: STARTER_UNITS.map((u) => u.code),
    conversions: [...STARTER_CONVERSIONS],
    costing: "weighted_average",
    capabilities: { ...DEFAULT_PRODUCT_CAPABILITIES },
  };
}

function ToggleCard({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition",
        checked
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {checked && <Check className="size-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function SwitchRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SetupWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { business, businessId, loading, onboarding, onboardingLoaded, isAdmin, refresh, refreshSettings } =
    useBusiness();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Seed the wizard from the business record and any saved draft.
  useEffect(() => {
    if (hydrated || !business || !onboardingLoaded) return;
    const saved = (onboarding?.draft ?? {}) as Partial<Draft>;
    const country = COUNTRIES.find((c) => c.code === (saved.country ?? business.country));
    setDraft({
      ...emptyDraft(),
      name: business.name ?? "",
      type: business.type ?? "retail",
      industry: business.industry ?? "",
      country: country?.code ?? "PH",
      currency: business.currency ?? country?.currency ?? "PHP",
      timezone: business.timezone ?? country?.timezone ?? "Asia/Manila",
      features: { ...defaultsForType(business.type ?? "retail") },
      ...saved,
    } as Draft);
    if (onboarding?.current_step) setStep(Math.min(Number(onboarding.current_step) || 1, STEPS.length));
    setHydrated(true);
  }, [business, onboarding, onboardingLoaded, hydrated]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setFeature = (key: FeatureKey, v: boolean) =>
    setDraft((d) => ({ ...d, features: { ...d.features, [key]: v } }));
  const on = (key: FeatureKey) => !!draft.features[key];

  /** Business type only *recommends* settings — the user can change everything. */
  function applyTypeRecommendations(type: string) {
    const rec = defaultsForType(type);
    set({
      type,
      features: { ...rec } as Partial<Record<FeatureKey, boolean>>,
      costing: rec.costing_method,
    });
    toast.info("Recommended settings loaded for this business type — change anything you like.");
  }

  function toggleTrack(key: string) {
    const item = TRACK_ITEMS.find((t) => t.key === key)!;
    const selected = draft.tracks.includes(key);
    const tracks = selected ? draft.tracks.filter((t) => t !== key) : [...draft.tracks, key];
    const features = { ...draft.features };
    if (!selected) item.features.forEach((f) => (features[f] = true));
    set({ tracks, features });
  }

  async function saveDraft(nextStep = step, silent = false) {
    if (!businessId) return;
    const { error } = await db
      .from("business_onboarding")
      .upsert({ business_id: businessId, draft, current_step: nextStep }, { onConflict: "business_id" });
    if (error && !silent) toast.error(error.message);
    else if (!silent) toast.success("Progress saved — you can finish this later.");
  }

  function next() {
    if (step === 1 && !draft.name.trim()) return toast.error("Business name is required");
    const n = Math.min(step + 1, STEPS.length);
    setStep(n);
    void saveDraft(n, true);
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function complete() {
    if (!businessId) return;
    setSaving(true);
    try {
      const multi = draft.locationMode === "many";
      const features = { ...draft.features };
      if (multi) {
        features.track_locations = true;
        features.enable_stock_transfers = true;
      }

      const { error: bizError } = await db
        .from("businesses")
        .update({
          name: draft.name.trim(),
          type: draft.type,
          industry: draft.industry || null,
          country: draft.country,
          currency: draft.currency,
          timezone: draft.timezone,
        })
        .eq("id", businessId);
      if (bizError) throw bizError;

      const payload: Record<string, any> = { business_id: businessId };
      FEATURE_GROUPS.flatMap((g) => g.items).forEach((i) => (payload[i.key] = !!features[i.key]));
      payload.costing_method = draft.costing;
      payload.extra = { product_capabilities: draft.capabilities, tracks: draft.tracks };
      const { error: settingsError } = await db
        .from("business_settings")
        .upsert(payload, { onConflict: "business_id" });
      if (settingsError) throw settingsError;

      // Locations — reuse the seeded default instead of creating duplicates.
      const { data: existing } = await db
        .from("warehouses")
        .select("id, name, is_default")
        .eq("business_id", businessId);
      const rows = (existing ?? []) as any[];
      const wanted = (multi ? draft.locations : draft.locations.slice(0, 1)).filter((l) => l.name.trim());
      for (const [i, loc] of wanted.entries()) {
        const match = rows.find((r) => r.name?.toLowerCase() === loc.name.trim().toLowerCase());
        if (match) continue;
        const reusable = i === 0 ? rows.find((r) => r.is_default) : null;
        if (reusable) {
          await db
            .from("warehouses")
            .update({ name: loc.name.trim(), type: loc.type, location: loc.address || null })
            .eq("id", reusable.id);
        } else {
          await db.from("warehouses").insert({
            business_id: businessId,
            name: loc.name.trim(),
            type: loc.type,
            location: loc.address || null,
            is_default: i === 0 && rows.length === 0,
          });
        }
      }

      // Units of measure + conversions (only add what is missing).
      const { data: existingUnits } = await db
        .from("units_of_measure")
        .select("code")
        .eq("business_id", businessId);
      const haveUnits = new Set((existingUnits ?? []).map((u: any) => u.code));
      const newUnits = STARTER_UNITS.filter(
        (u) => draft.units.includes(u.code) && !haveUnits.has(u.code),
      ).map((u) => ({ ...u, business_id: businessId }));
      if (newUnits.length) await db.from("units_of_measure").insert(newUnits);

      const { data: existingConv } = await db
        .from("unit_conversions")
        .select("from_unit, to_unit")
        .eq("business_id", businessId)
        .is("product_id", null);
      const haveConv = new Set(
        (existingConv ?? []).map((c: any) => `${c.from_unit}>${c.to_unit}`),
      );
      const newConv = draft.conversions
        .filter((c) => c.from_unit && c.to_unit && Number(c.factor) > 0)
        .filter((c) => !haveConv.has(`${c.from_unit}>${c.to_unit}`))
        .map((c) => ({ ...c, factor: Number(c.factor), business_id: businessId }));
      if (newConv.length) await db.from("unit_conversions").insert(newConv);

      const { error: onbError } = await db.from("business_onboarding").upsert(
        {
          business_id: businessId,
          draft,
          current_step: STEPS.length,
          completed: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );
      if (onbError) throw onbError;

      refresh();
      refreshSettings();
      queryClient.invalidateQueries();
      setDone(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Setup could not be saved");
    } finally {
      setSaving(false);
    }
  }

  const countryOptions = useMemo(() => COUNTRIES, []);

  if (loading || !business || !hydrated) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-24 text-center">
        <h1 className="font-display text-xl font-semibold">Setup is owner-only</h1>
        <p className="text-sm text-muted-foreground">
          Ask a business owner or admin to finish the workspace setup.
        </p>
        <Button onClick={() => navigate({ to: "/dashboard" })}>Go to dashboard</Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <CheckCircle2 className="size-14 text-success" />
        <h1 className="font-display text-2xl font-semibold">Your Daraven ERP workspace is ready.</h1>
        <p className="text-sm text-muted-foreground">Let&apos;s add your first product.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate({ to: "/products" })}>Add First Product</Button>
          <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold">Business setup</h1>
            <p className="text-sm text-muted-foreground">
              Step {step} of {STEPS.length} — {STEPS[step - 1]}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
            Skip for now
          </Button>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < step ? "bg-primary" : "bg-muted",
              )}
              title={s}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tell us about your business</CardTitle>
            <CardDescription>
              Your business type only suggests settings — you can change everything later.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Business name</Label>
              <Input
                className="mt-1.5"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Beef N Buns"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Business type</Label>
              <Select value={draft.type} onValueChange={applyTypeRecommendations}>
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
              <p className="mt-1.5 text-xs text-muted-foreground">
                {BUSINESS_TYPES.find((t) => t.value === draft.type)?.summary}
              </p>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Industry (optional)</Label>
              <Input
                className="mt-1.5"
                value={draft.industry}
                onChange={(e) => set({ industry: e.target.value })}
                placeholder="Fast food"
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Country</Label>
              <Select
                value={draft.country}
                onValueChange={(v) => {
                  const c = countryOptions.find((x) => x.code === v)!;
                  set({ country: v, currency: c.currency, timezone: c.timezone });
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countryOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Currency</Label>
              <Select value={draft.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label className="text-xs">Timezone</Label>
              <Input
                className="mt-1.5"
                value={draft.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What does your business need to track?</CardTitle>
            <CardDescription>Pick everything that applies. You can add more later.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {TRACK_ITEMS.map((t) => (
              <ToggleCard
                key={t.key}
                title={t.label}
                hint={t.hint}
                checked={draft.tracks.includes(t.key)}
                onChange={() => toggleTrack(t.key)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How would you like to track inventory?</CardTitle>
            <CardDescription>
              These are recommendations for a {BUSINESS_TYPES.find((t) => t.value === draft.type)?.label}.
              Change anything you need.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {BASIC_INVENTORY.map((k) => (
                <SwitchRow
                  key={k}
                  title={FEATURE_META[k].label}
                  hint={FEATURE_META[k].hint}
                  checked={on(k)}
                  onChange={(v) => setFeature(k, v)}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setAdvanced((a) => !a)}
            >
              <ChevronDown className={cn("size-4 transition", advanced && "rotate-180")} />
              Advanced inventory settings
            </Button>
            {advanced && (
              <div className="grid gap-3 sm:grid-cols-2">
                {ADVANCED_INVENTORY.map((k) => (
                  <SwitchRow
                    key={k}
                    title={FEATURE_META[k].label}
                    hint={FEATURE_META[k].hint}
                    checked={on(k)}
                    onChange={(v) => setFeature(k, v)}
                  />
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => applyTypeRecommendations(draft.type)}
            >
              <Sparkles className="size-4" /> Reset to recommended
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where do you store or manage your inventory?</CardTitle>
            <CardDescription>One place is perfectly fine — add more only if you need them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleCard
                title="One location"
                hint="Everything is stocked in a single place."
                checked={draft.locationMode === "one"}
                onChange={() => set({ locationMode: "one" })}
              />
              <ToggleCard
                title="Multiple locations"
                hint="Stores, warehouses, kitchens or sites, with transfers between them."
                checked={draft.locationMode === "many"}
                onChange={() => set({ locationMode: "many" })}
              />
            </div>

            {(draft.locationMode === "many" ? draft.locations : draft.locations.slice(0, 1)).map(
              (loc, i) => (
                <div key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <Label className="text-xs">Location name</Label>
                    <Input
                      className="mt-1.5"
                      value={loc.name}
                      placeholder="Main Store"
                      onChange={(e) => {
                        const locations = [...draft.locations];
                        locations[i] = { ...loc, name: e.target.value };
                        set({ locations });
                      }}
                    />
                  </div>
                  {draft.locationMode === "many" && (
                    <>
                      <div className="min-w-0">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={loc.type}
                          onValueChange={(v) => {
                            const locations = [...draft.locations];
                            locations[i] = { ...loc, type: v };
                            set({ locations });
                          }}
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WIZARD_LOCATION_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <Label className="text-xs">Address</Label>
                          <Input
                            className="mt-1.5"
                            value={loc.address}
                            onChange={(e) => {
                              const locations = [...draft.locations];
                              locations[i] = { ...loc, address: e.target.value };
                              set({ locations });
                            }}
                          />
                        </div>
                        {draft.locations.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove location"
                            onClick={() =>
                              set({ locations: draft.locations.filter((_, x) => x !== i) })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ),
            )}

            {draft.locationMode === "many" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  set({
                    locations: [...draft.locations, { name: "", type: "warehouse", address: "" }],
                  })
                }
              >
                <Plus className="size-4" /> Add location
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Units you buy, stock and sell in</CardTitle>
            <CardDescription>
              Conversions are reused across products, purchasing, inventory, recipes, sales and production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {STARTER_UNITS.map((u) => (
                <ToggleCard
                  key={u.code}
                  title={u.name}
                  hint={u.code}
                  checked={draft.units.includes(u.code)}
                  onChange={(v) =>
                    set({
                      units: v
                        ? [...draft.units, u.code]
                        : draft.units.filter((c) => c !== u.code),
                    })
                  }
                />
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Conversion rules</p>
              {draft.conversions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="w-24">
                    <Label className="text-xs">1 of</Label>
                    <Input
                      className="mt-1.5"
                      value={c.from_unit}
                      onChange={(e) => {
                        const conversions = [...draft.conversions];
                        conversions[i] = { ...c, from_unit: e.target.value };
                        set({ conversions });
                      }}
                    />
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground">=</span>
                  <div className="w-28">
                    <Label className="text-xs">Quantity</Label>
                    <Input
                      className="mt-1.5"
                      type="number"
                      value={c.factor}
                      onChange={(e) => {
                        const conversions = [...draft.conversions];
                        conversions[i] = { ...c, factor: Number(e.target.value) };
                        set({ conversions });
                      }}
                    />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs">of</Label>
                    <Input
                      className="mt-1.5"
                      value={c.to_unit}
                      onChange={(e) => {
                        const conversions = [...draft.conversions];
                        conversions[i] = { ...c, to_unit: e.target.value };
                        set({ conversions });
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove conversion"
                    onClick={() => set({ conversions: draft.conversions.filter((_, x) => x !== i) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() =>
                  set({
                    conversions: [...draft.conversions, { from_unit: "", to_unit: "pcs", factor: 1 }],
                  })
                }
              >
                <Plus className="size-4" /> Add conversion
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How should Daraven ERP calculate inventory cost?</CardTitle>
            <CardDescription>Authorized users can change this later in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {COSTING_METHODS.map((m) => (
              <ToggleCard
                key={m.value}
                title={COSTING_PLAIN[m.value].label}
                hint={COSTING_PLAIN[m.value].hint}
                checked={draft.costing === m.value}
                onChange={() => set({ costing: m.value })}
              />
            ))}
            <p className="text-xs text-muted-foreground">
              Recommended: {COSTING_PLAIN.weighted_average.label}.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 7 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Product fields</CardTitle>
            <CardDescription>
              Daraven ERP configures your product form from your inventory needs. Turn off anything you
              don&apos;t use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {PRODUCT_CAPABILITIES.map((c) => (
                <SwitchRow
                  key={c.key}
                  title={c.label}
                  hint={c.hint}
                  checked={!!draft.capabilities[c.key]}
                  onChange={(v) => set({ capabilities: { ...draft.capabilities, [c.key]: v } })}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Variants, batches, expiry, serial numbers and recipes follow the tracking choices you made
              earlier.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 8 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review your setup</CardTitle>
            <CardDescription>Use Edit on any section to adjust before finishing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            <ReviewSection title="Business" onEdit={() => setStep(1)}>
              <p className="font-medium">{draft.name || "—"}</p>
              <p className="text-muted-foreground">
                {BUSINESS_TYPES.find((t) => t.value === draft.type)?.label}
                {draft.industry ? ` · ${draft.industry}` : ""}
              </p>
              <p className="text-muted-foreground">
                {COUNTRIES.find((c) => c.code === draft.country)?.name} · {draft.currency} ·{" "}
                {draft.timezone}
              </p>
            </ReviewSection>

            <ReviewSection title="Inventory" onEdit={() => setStep(3)}>
              <div className="flex flex-wrap gap-1.5">
                {FEATURE_GROUPS.flatMap((g) => g.items)
                  .filter((i) => on(i.key))
                  .map((i) => (
                    <Badge key={i.key} variant="secondary">
                      {i.label} ✓
                    </Badge>
                  ))}
              </div>
            </ReviewSection>

            <ReviewSection title="Locations" onEdit={() => setStep(4)}>
              {(draft.locationMode === "many" ? draft.locations : draft.locations.slice(0, 1))
                .filter((l) => l.name.trim())
                .map((l) => (
                  <p key={l.name} className="text-muted-foreground">
                    {l.name}
                  </p>
                ))}
            </ReviewSection>

            <ReviewSection title="Costing" onEdit={() => setStep(6)}>
              <p className="text-muted-foreground">{COSTING_PLAIN[draft.costing].label}</p>
            </ReviewSection>

            <ReviewSection title="Product fields" onEdit={() => setStep(7)}>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_CAPABILITIES.filter((c) => draft.capabilities[c.key]).map((c) => (
                  <Badge key={c.key} variant="secondary">
                    {c.label} ✓
                  </Badge>
                ))}
              </div>
            </ReviewSection>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" className="gap-2" onClick={back} disabled={step === 1}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void saveDraft()}>
            Save and continue later
          </Button>
          {step < STEPS.length ? (
            <Button className="gap-2" onClick={next}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button className="gap-2" onClick={complete} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Complete setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      {children}
    </div>
  );
}

export type { ProductCapability };
