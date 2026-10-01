import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GroupedSelect } from "@/components/grouped-select";
import { ItemImages } from "@/components/item-images";
import { db, type Row } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { titleCase } from "@/lib/format";
import { UNIT_OPTION_GROUPS } from "@/lib/business-config";
import type { FormCtx } from "@/components/resource-page";
import type { useProductVariants } from "@/components/product-variants-section";

type BundleLine = { key: string; productId: string; quantity: number };
const newLine = (): BundleLine => ({ key: crypto.randomUUID(), productId: "", quantity: 1 });
export type ItemFormProps = FormCtx & {
  businessId: string | null; currency: string; variantsEnabled: boolean;
  variants: ReturnType<typeof useProductVariants>;
  submit: () => void; close: () => void; saving: boolean;
  bundleLines: BundleLine[]; setBundleLines: (lines: BundleLine[]) => void;
};
const TYPES = ["product", "service", "bundle", "non_stock"];
const SUBTYPES: Record<string, string[]> = {
  product: ["standard_product", "raw_material", "finished_product", "consumable"],
  service: ["standard_service", "consultation", "labor"],
  bundle: ["fixed_bundle", "custom_bundle"],
  non_stock: ["non_stock_item", "digital"],
};
export function ItemForm({ form, setForm, editing, businessId, currency, variantsEnabled, variants, submit, close, saving, bundleLines, setBundleLines }: ItemFormProps) {
  const kind = String(form.item_type || "product");
  const hasVariants = kind === "product" && !!form.has_variants && variantsEnabled;
  const [skuError, setSkuError] = useState("");
  const { data: references } = useQuery({
    queryKey: ["item-form-references", businessId], enabled: !!businessId,
    queryFn: async () => {
      const [categories, suppliers, employees, locations, products] = await Promise.all([
        db.from("categories").select("id,name").eq("business_id", businessId),
        db.from("suppliers").select("id,name").eq("business_id", businessId),
        db.from("employees").select("id,name").eq("business_id", businessId),
        db.from("warehouses").select("id,name").eq("business_id", businessId),
        db.from("products").select("id,name,sku").eq("business_id", businessId),
      ]);
      return { categories: categories.data ?? [], suppliers: suppliers.data ?? [], employees: employees.data ?? [], locations: locations.data ?? [], products: products.data ?? [] } as Record<string, Row[]>;
    },
  });
  useEffect(() => {
    const sku = String(form.sku ?? "").trim().toLowerCase();
    if (!sku || !businessId) { setSkuError(""); return; }
    const timer = setTimeout(async () => {
      const [products, rows] = await Promise.all([
        db.from("products").select("id").eq("business_id", businessId).ilike("sku", sku).limit(5),
        db.from("product_variants").select("product_id").eq("business_id", businessId).ilike("sku", sku).limit(5),
      ]);
      setSkuError((products.data ?? []).some((p: Row) => p.id !== editing?.id) || (rows.data ?? []).some((v: Row) => v.product_id !== editing?.id) ? "SKU already used in this business" : "");
    }, 250);
    return () => clearTimeout(timer);
  }, [businessId, editing?.id, form.sku]);
  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });
  const text = (key: string, label: string, type = "text") => <div className="min-w-0 space-y-1.5"><Label htmlFor={`item-${key}`}>{label}</Label><Input id={`item-${key}`} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} /></div>;
  const choice = (key: string, label: string, options: Row[], placeholder = "Select") => <div className="min-w-0 space-y-1.5"><Label>{label}</Label><Select value={String(form[key] || "none")} onValueChange={(v) => set(key, v === "none" ? null : v)}><SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{options.map((o) => <SelectItem key={String(o.id)} value={String(o.id)}>{String(o.name)}</SelectItem>)}</SelectContent></Select></div>;
  const toggle = (key: string, label: string, disabled = false) => <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form[key]} disabled={disabled} onCheckedChange={(v) => set(key, v === true)} />{label}</label>;
  const section = "space-y-4 rounded-md border border-border bg-card p-4 sm:p-5";
  const cost = Number(form.cost_price ?? 0), price = Number(form.selling_price ?? 0);
  const images = Array.isArray(form.image_urls) ? form.image_urls as string[] : form.image_url ? [String(form.image_url)] : [];
  return <>
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-4 pr-14">
      <div><h2 className="text-xl font-semibold">{editing ? "Edit item" : "New item"}</h2><p className="text-sm text-muted-foreground">{editing ? "Update item details" : "Create an item in your catalog"}</p></div>
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="button" disabled={saving || !!skuError} onClick={submit}>{saving ? "Saving…" : editing ? "Save changes" : "Create item"}</Button></div>
    </div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
      <div className={section}>
        <div className="grid gap-4 sm:grid-cols-2">
          {<div className="space-y-1.5"><Label>Item type</Label><Select value={kind} onValueChange={(v) => setForm({ ...form, item_type: v, item_subtype: SUBTYPES[v][0], inventory_model: v === "service" ? "service" : v === "non_stock" || v === "bundle" ? "non_stocked_item" : "stocked_item", track_stock: v === "product", has_variants: v === "product" ? form.has_variants : false })}><SelectTrigger aria-label="Item type"><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((id) => <SelectItem key={id} value={id}>{titleCase(id)}</SelectItem>)}</SelectContent></Select></div>}
          {choice("item_subtype", "Subtype", SUBTYPES[kind].map((id) => ({ id, name: titleCase(id) })))}
        </div>
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">{titleCase(kind)}</Badge><Badge variant={form.status === "inactive" ? "secondary" : "default"}>{titleCase(String(form.status || "active"))}</Badge>{form.track_stock && <Badge variant="outline">Stock tracked</Badge>}{hasVariants && <Badge variant="outline">Variants</Badge>}</div>
        <div className="grid gap-4 sm:grid-cols-2">{text("name", "Name *")}{text("sku", "SKU")}{skuError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{skuError}</p>}{kind !== "service" && text("barcode", "Barcode")}{text("brand", "Brand")}
          {choice("category_id", "Category", references?.categories ?? [])}
          <div className="space-y-1.5"><Label>{kind === "service" ? "Billing unit" : "Unit"}</Label><GroupedSelect groups={UNIT_OPTION_GROUPS} searchable value={String(kind === "service" ? form.billing_unit || form.unit || "pcs" : form.unit || "pcs")} onChange={(v) => setForm({ ...form, unit: v, ...(kind === "service" ? { billing_unit: v } : {}) })} /></div>
          {kind !== "service" && choice("supplier_id", "Primary supplier", references?.suppliers ?? [])}
          {choice("status", "Status", ["active", "inactive", "discontinued"].map((id) => ({ id, name: titleCase(id) })))}
        </div>
      </div>
      {kind === "service" && <section className={section}><h3 className="font-semibold">Service details</h3><div className="grid gap-4 sm:grid-cols-2">{text("service_duration_minutes", "Duration (minutes)", "number")}{text("commission_rate", "Commission rate (%)", "number")}{choice("assigned_employee_id", "Assigned employee", references?.employees ?? [])}{text("income_account", "Income account")}{toggle("requires_booking", "Requires booking")}</div></section>}
      {kind === "bundle" && <section className={section}><h3 className="font-semibold">Bundle components</h3>{bundleLines.map((line) => <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-end gap-2"><div className="space-y-1.5"><Label>Component</Label><Select value={line.productId || "none"} onValueChange={(v) => setBundleLines(bundleLines.map((x) => x.key === line.key ? { ...x, productId: v === "none" ? "" : v } : x))}><SelectTrigger aria-label="Component"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">Select</SelectItem>{(references?.products ?? []).filter((p) => p.id !== editing?.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Qty</Label><Input type="number" min="0.001" step="any" value={line.quantity} onChange={(e) => setBundleLines(bundleLines.map((x) => x.key === line.key ? { ...x, quantity: Number(e.target.value) } : x))} /></div><Button type="button" size="icon" variant="ghost" aria-label="Remove component" onClick={() => setBundleLines(bundleLines.filter((x) => x.key !== line.key))}>×</Button></div>)}<Button type="button" variant="outline" onClick={() => setBundleLines([...bundleLines, newLine()])}>Add component</Button>{toggle("bundle_fixed_price", "Fixed bundle price")}</section>}
      {kind !== "service" && <section className={section}><h3 className="font-semibold">Costing and stock</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {choice("costing_method", "Costing method", [{ id: "weighted_average", name: "Automatic (weighted average)" }, { id: "fifo", name: "FIFO" }, { id: "standard", name: "Standard" }])}
        {text("cost_price", hasVariants ? "Default cost price" : "Cost price", "number")}{text("selling_price", hasVariants ? "Default selling price" : "Selling price", "number")}
        {!hasVariants && !editing && !!form.track_stock && text("opening_quantity", "Opening quantity", "number")}{text("reorder_level", "Reorder level", "number")}{text("reorder_quantity", "Reorder quantity", "number")}{text("tax_rate", "Tax rate (%)", "number")}{choice("default_location_id", "Location", references?.locations ?? [])}
      </div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Profit per unit</p><p className="text-lg font-semibold tabular-nums">{formatCurrency(price - cost, currency)}</p></div><div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">Gross margin</p><p className="text-lg font-semibold tabular-nums">{price > 0 ? `${(((price - cost) / price) * 100).toFixed(1)}%` : "—"}</p></div></div>
      <div className="flex flex-wrap gap-x-5 gap-y-3">{toggle("is_sellable", "Sellable")}{toggle("is_purchasable", "Purchasable")}{toggle("track_stock", "Track stock")}{kind === "product" && toggle("has_variants", "Has variants", !variantsEnabled)}</div>{hasVariants && <p className="text-xs text-muted-foreground">These prices and reorder values are defaults. Each variant keeps its own values.</p>}</section>}
      {hasVariants && <section className="space-y-3"><h3 className="font-semibold">Variants</h3>{variants.renderOptions({ cost, price, sku: String(form.sku ?? ""), name: String(form.name ?? ""), reorderLevel: Number(form.reorder_level ?? 0) })}{variants.renderTable()}</section>}
      <section className={section}><h3 className="font-semibold">Description</h3><Textarea aria-label="Description" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></section>
      <section className={section}><h3 className="font-semibold">Item images</h3><ItemImages businessId={businessId} images={images} onChange={(next) => setForm({ ...form, image_urls: next, image_url: next[0] ?? null })} /></section>
    </div>
  </>;
}
export { newLine };
