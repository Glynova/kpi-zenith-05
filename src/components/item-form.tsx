import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GroupedSelect } from "@/components/grouped-select";
import { ItemImages } from "@/components/item-images";
import { AddonGroupsSection } from "@/components/addon-groups-section";
import { MadeFromSection, type MadeFromLine } from "@/components/made-from-section";
import { db, type Row } from "@/lib/db";
import { formatCurrency, titleCase } from "@/lib/format";
import { UNIT_OPTION_GROUPS } from "@/lib/business-config";
import { useBusiness } from "@/lib/business-context";
import {
  ALL_KINDS,
  KIND_INFO,
  MADE_FROM,
  kindOf,
  kindsForBusiness,
  patchForKind,
  type ItemKind,
} from "@/lib/item-kinds";
import type { FormCtx } from "@/components/resource-page";
import type { useProductVariants } from "@/components/product-variants-section";

export type ItemFormProps = FormCtx & {
  businessId: string | null;
  currency: string;
  variantsEnabled: boolean;
  variants: ReturnType<typeof useProductVariants>;
  submit: () => void;
  close: () => void;
  saving: boolean;
  bundleLines: MadeFromLine[];
  setBundleLines: (lines: MadeFromLine[]) => void;
};

export function ItemForm({
  form,
  setForm,
  editing,
  businessId,
  currency,
  variantsEnabled,
  variants,
  submit,
  close,
  saving,
  bundleLines,
  setBundleLines,
}: ItemFormProps) {
  const { business } = useBusiness();
  const businessType = String(business?.type ?? "retail");
  const kind = kindOf(form);
  const preset = kindsForBusiness(businessType);
  const [showAll, setShowAll] = useState(!preset.includes(kind));
  const [advanced, setAdvanced] = useState(false);
  const madeFrom = MADE_FROM.includes(kind);
  const isService = kind === "service" || kind === "package";
  const ownStock = !isService && (!madeFrom || form.consumption_mode === "on_production");
  const hasVariants = kind === "ready" && !!form.has_variants && variantsEnabled;
  const [skuError, setSkuError] = useState("");

  const { data: references } = useQuery({
    queryKey: ["item-form-references", businessId],
    enabled: !!businessId,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const [categories, suppliers, employees, locations] = await Promise.all([
        db.from("categories").select("id,name").eq("business_id", businessId),
        db.from("suppliers").select("id,name").eq("business_id", businessId),
        db.from("employees").select("id,name").eq("business_id", businessId),
        db.from("warehouses").select("id,name").eq("business_id", businessId),
      ]);
      return {
        categories: categories.data ?? [],
        suppliers: suppliers.data ?? [],
        employees: employees.data ?? [],
        locations: locations.data ?? [],
      } as Record<string, Row[]>;
    },
  });

  useEffect(() => {
    const sku = String(form.sku ?? "")
      .trim()
      .toLowerCase();
    if (!sku || !businessId) {
      setSkuError("");
      return;
    }
    const timer = setTimeout(async () => {
      const [products, rows] = await Promise.all([
        db.from("products").select("id").eq("business_id", businessId).ilike("sku", sku).limit(5),
        db
          .from("product_variants")
          .select("product_id")
          .eq("business_id", businessId)
          .ilike("sku", sku)
          .limit(5),
      ]);
      setSkuError(
        (products.data ?? []).some((p: Row) => p.id !== editing?.id) ||
          (rows.data ?? []).some((v: Row) => v.product_id !== editing?.id)
          ? "That code is already used in this business"
          : "",
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [businessId, editing?.id, form.sku]);

  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });
  const pickKind = (next: ItemKind) => {
    if (next === kind) return;
    const filled = bundleLines.some((l) => l.productId) || (form.has_variants && variants);
    if (editing || filled) {
      if (!window.confirm("Changing the item type may hide some fields you filled in. Continue?"))
        return;
    }
    setForm({ ...form, ...patchForKind(next) });
  };
  const text = (key: string, label: string, type = "text", hint?: string) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`item-${key}`}>{label}</Label>
      <Input
        id={`item-${key}`}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const choice = (key: string, label: string, options: Row[]) => (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={String(form[key] || "none")}
        onValueChange={(v) => set(key, v === "none" ? null : v)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {options.map((o) => (
            <SelectItem key={String(o.id)} value={String(o.id)}>
              {String(o.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const toggle = (key: string, label: string, disabled = false) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={!!form[key]}
        disabled={disabled}
        onCheckedChange={(v) => set(key, v === true)}
      />
      {label}
    </label>
  );
  const section = "space-y-4 rounded-md border border-border bg-card p-4 sm:p-5";
  const cost = Number(form.cost_price ?? 0);
  const price = Number(form.selling_price ?? 0);
  const minutes = Number(form.service_duration_minutes ?? 0);
  const perHour = form.billing_unit === "per_hour";
  const effectivePrice = perHour ? (price * minutes) / 60 : price;
  const commission = (effectivePrice * Number(form.commission_rate ?? 0)) / 100;
  const images = Array.isArray(form.image_urls)
    ? (form.image_urls as string[])
    : form.image_url
      ? [String(form.image_url)]
      : [];
  const cards = showAll ? ALL_KINDS : preset;
  const fmt = (n: number) => formatCurrency(n, currency);

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-4 pr-14">
        <div>
          <h2 className="text-xl font-semibold">{editing ? "Edit item" : "New item"}</h2>
          <p className="text-sm text-muted-foreground">
            Pick what you're adding, then fill in the basics.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !!skuError} onClick={submit}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create item"}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section className={section}>
          <h3 className="font-semibold">What are you adding?</h3>
          <div
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            role="radiogroup"
            aria-label="Item type"
          >
            {cards.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => pickKind(k)}
                className={`rounded-md border p-3 text-left transition-colors ${kind === k ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}
              >
                <p className="text-sm font-medium">{KIND_INFO[k].label}</p>
                <p className="text-xs text-muted-foreground">{KIND_INFO[k].hint}</p>
              </button>
            ))}
          </div>
          {!showAll && (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setShowAll(true)}
            >
              More item types
            </Button>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {text("name", "Name *")}
            {choice("category_id", "Category", references?.categories ?? [])}
            {!isService && (
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <GroupedSelect
                  groups={UNIT_OPTION_GROUPS}
                  searchable
                  value={String(form.unit || "pcs")}
                  onChange={(v) => set("unit", v)}
                />
              </div>
            )}
            {kind !== "ingredient" &&
              text(
                "selling_price",
                hasVariants ? "Usual price" : perHour ? "Rate per hour" : "Selling price",
                "number",
                perHour && minutes > 0
                  ? `= ${fmt(effectivePrice)} for ${minutes} minutes`
                  : undefined,
              )}
            {!madeFrom &&
              !isService &&
              text(
                "cost_price",
                hasVariants ? "Usual cost" : "Cost",
                "number",
                `Cost basis: per ${form.unit || "pcs"}`,
              )}
            {ownStock &&
              !hasVariants &&
              !editing &&
              text("opening_quantity", "Starting quantity", "number")}
            {ownStock && text("reorder_level", "Alert me below", "number")}
          </div>
          {!madeFrom && !isService && kind !== "ingredient" && (
            <p className="text-sm text-muted-foreground">
              Profit {fmt(price - cost)} · Margin{" "}
              {price > 0 ? `${(((price - cost) / price) * 100).toFixed(1)}%` : "Set a price"}
              {price > 0 && price < cost && (
                <span className="text-destructive"> · price is below cost</span>
              )}
            </p>
          )}
          {kind === "ready" &&
            variantsEnabled &&
            toggle("has_variants", "This item comes in options (size, colour…)")}
        </section>

        {isService && (
          <section className={section}>
            <h3 className="font-semibold">Service details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {text("service_duration_minutes", "Duration (minutes)", "number")}
              <div className="space-y-1.5">
                <Label>Pricing</Label>
                <Select
                  value={perHour ? "per_hour" : "fixed"}
                  onValueChange={(v) =>
                    set("billing_unit", v === "per_hour" ? "per_hour" : "fixed")
                  }
                >
                  <SelectTrigger aria-label="Pricing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed price</SelectItem>
                    <SelectItem value="per_hour">Per hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {choice("assigned_employee_id", "Who does it", references?.employees ?? [])}
              {text("commission_rate", "Staff commission (%)", "number")}
            </div>
            <p className="text-sm text-muted-foreground">
              Commission {fmt(commission)} · Profit {fmt(effectivePrice - cost - commission)}
              {minutes > 0 &&
                ` · Profit per hour ${fmt(((effectivePrice - cost - commission) * 60) / minutes)}`}
            </p>
          </section>
        )}

        {(madeFrom || isService) && (
          <MadeFromSection
            businessId={businessId}
            excludeId={editing?.id}
            lines={bundleLines}
            setLines={setBundleLines}
            currency={currency}
            form={form}
            set={set}
            showWaste={businessType === "manufacturing" || advanced}
            showLabor={kind === "finished" || advanced}
            canProduce={!!editing}
            title={
              kind === "menu"
                ? "Ingredients"
                : isService
                  ? "Supplies used"
                  : kind === "combo"
                    ? "What's in the combo"
                    : "Made from"
            }
          />
        )}

        {hasVariants && (
          <section className="space-y-3">
            <h3 className="font-semibold">Options and variants</h3>
            {variants.renderOptions({
              cost,
              price,
              sku: String(form.sku ?? ""),
              name: String(form.name ?? ""),
              reorderLevel: Number(form.reorder_level ?? 0),
            })}
            {variants.renderTable()}
          </section>
        )}

        {kind !== "ingredient" && kind !== "finished" && (
          <AddonGroupsSection
            businessId={businessId}
            currency={currency}
            selected={(form.addon_group_ids as string[] | undefined) ?? []}
            setSelected={(ids) => set("addon_group_ids", ids)}
          />
        )}

        <section className={section}>
          <h3 className="font-semibold">Photos and description</h3>
          <ItemImages
            businessId={businessId}
            images={images}
            onChange={(next) => setForm({ ...form, image_urls: next, image_url: next[0] ?? null })}
          />
          <Textarea
            aria-label="Description"
            placeholder="Description (optional)"
            value={form.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </section>

        <section className={section}>
          <button
            type="button"
            className="flex w-full items-center justify-between font-semibold"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            Advanced
            <ChevronDown
              className={`size-4 transition-transform ${advanced ? "rotate-180" : ""}`}
            />
          </button>
          {advanced && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {text("sku", "Item code", "text", "Left blank, one is made for you")}
                {skuError && (
                  <p role="alert" className="text-sm text-destructive sm:col-span-2">
                    {skuError}
                  </p>
                )}
                {!isService && text("barcode", "Barcode")}
                {text("brand", "Brand")}
                {!isService && choice("supplier_id", "Supplier", references?.suppliers ?? [])}
                {choice(
                  "status",
                  "Status",
                  ["active", "inactive", "discontinued"].map((id) => ({ id, name: titleCase(id) })),
                )}
                {text("tax_rate", "Tax rate (%)", "number")}
                {ownStock && text("reorder_quantity", "Reorder quantity", "number")}
                {ownStock && text("max_stock", "Maximum stock", "number")}
                {ownStock &&
                  choice("default_location_id", "Stock location", references?.locations ?? [])}
                {!madeFrom &&
                  !isService &&
                  choice("costing_method", "Costing method", [
                    { id: "weighted_average", name: "Automatic average" },
                    { id: "fifo", name: "FIFO" },
                    { id: "standard", name: "Fixed cost" },
                  ])}
                {isService && text("income_account", "Income account")}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {toggle("is_sellable", "Sellable")}
                {toggle("is_purchasable", "Purchasable")}
                {!isService && !madeFrom && toggle("track_stock", "Track stock")}
                {isService && toggle("requires_booking", "Requires booking")}
                {kind === "combo" && toggle("bundle_fixed_price", "Fixed combo price")}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export { newLine } from "@/components/made-from-section";
