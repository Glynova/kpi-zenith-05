import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNIT_CATEGORIES } from "@/lib/business-config";
import { useBusiness } from "@/lib/business-context";
import { db, type Row } from "@/lib/db";
import { normalizeUnit } from "@/lib/units";

const unitColumns: Column[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Unit" },
  { key: "category", label: "Category", format: "badge" },
  { key: "is_base", label: "Base unit", format: "boolean" },
];

const unitFields: Field[] = [
  { key: "code", label: "Code", type: "text", required: true, placeholder: "kg" },
  { key: "name", label: "Name", type: "text", required: true, placeholder: "Kilogram" },
  {
    key: "category",
    label: "Category",
    type: "select",
    options: UNIT_CATEGORIES,
    default: "count",
  },
  { key: "is_base", label: "Base unit for its category", type: "boolean", default: false },
];

const convColumns: Column[] = [
  { key: "from_unit", label: "From" },
  { key: "to_unit", label: "To" },
  { key: "factor", label: "Factor", format: "number" },
];

const convFields: Field[] = [
  { key: "from_unit", label: "From unit", type: "text", required: true, placeholder: "case" },
  { key: "to_unit", label: "To unit", type: "text", required: true, placeholder: "pcs" },
  { key: "factor", label: "Factor (1 from = N to)", type: "number", default: 1, required: true },
  {
    key: "product_id",
    label: "Only for product (optional)",
    type: "relation",
    relation: { table: "products" },
  },
];

const description = "Define the units you buy, stock and sell in, plus how they convert.";

export const Route = createFileRoute("/_authenticated/_shell/units")({
  head: () => ({
    meta: [
      { title: "Units of Measure — Daraven ERP" },
      { name: "description", content: description },
      { property: "og:title", content: "Units of Measure — Daraven ERP" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnitsPage,
});

function UnitsPage() {
  const { businessId } = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [appliesTo, setAppliesTo] = useState("whole");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceUnit, setSourceUnit] = useState("");
  const [factor, setFactor] = useState("");

  const { data } = useQuery({
    queryKey: ["item-unit-conversions", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const [products, variants, conversions] = await Promise.all([
        db
          .from("products")
          .select("id,name,sku,unit,item_type,status")
          .eq("business_id", businessId),
        db
          .from("product_variants")
          .select("id,product_id,name,sku,status")
          .eq("business_id", businessId),
        db.from("unit_conversions").select("*").eq("business_id", businessId),
      ]);
      if (products.error) throw products.error;
      if (variants.error) throw variants.error;
      if (conversions.error) throw conversions.error;
      return {
        products: (products.data ?? []) as Row[],
        variants: (variants.data ?? []) as Row[],
        conversions: (conversions.data ?? []) as Row[],
      };
    },
  });
  const products = (data?.products ?? []).filter(
    (p) => p.item_type !== "service" && p.status !== "archived",
  );
  const variants = (data?.variants ?? []).filter((v) => v.status !== "archived");
  const conversions = data?.conversions ?? [];
  const term = search.trim().toLowerCase();
  const visibleProducts = products.filter(
    (p) =>
      !term ||
      [p.name, p.sku, p.unit].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      ),
  );
  const selectedProduct = products.find((p) => p.id === selectedId);
  const itemVariants = variants.filter((v) => v.product_id === selectedId);
  const selectedVariantId = appliesTo === "whole" ? null : appliesTo;
  const selectedConversions = conversions.filter(
    (c) => c.product_id === selectedId && c.variant_id === selectedVariantId,
  );

  function resetEditor() {
    setEditingId(null);
    setSourceUnit("");
    setFactor("");
  }

  async function saveConversion() {
    if (!businessId || !selectedProduct) return;
    const unit = sourceUnit.trim();
    const amount = Number(factor);
    if (!unit) return toast.error("Enter a conversion unit");
    if (normalizeUnit(unit) === normalizeUnit(selectedProduct.unit))
      return toast.error("The stock unit is already the base 1:1 row");
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("Conversion factor must be greater than zero");
    const duplicate = selectedConversions.find(
      (c) => c.id !== editingId && normalizeUnit(c.from_unit) === normalizeUnit(unit),
    );
    if (duplicate) return toast.error("A conversion for this unit already exists");
    const payload = {
      business_id: businessId,
      product_id: selectedId,
      variant_id: selectedVariantId,
      from_unit: unit,
      to_unit: String(selectedProduct.unit),
      factor: amount,
    };
    const result = editingId
      ? await db.from("unit_conversions").update(payload).eq("id", editingId)
      : await db.from("unit_conversions").insert(payload);
    if (result.error) return toast.error(result.error.message);
    toast.success("Conversion saved");
    resetEditor();
    await queryClient.invalidateQueries({ queryKey: ["item-unit-conversions", businessId] });
  }

  async function deleteConversion(id: string) {
    const { error } = await db.from("unit_conversions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Conversion deleted");
    await queryClient.invalidateQueries({ queryKey: ["item-unit-conversions", businessId] });
  }

  function editConversion(row: Row) {
    setEditingId(row.id);
    setSourceUnit(String(row.from_unit));
    setFactor(String(row.factor));
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Item conversions</h2>
          <p className="text-sm text-muted-foreground">
            Define business-scoped units for an item. These rules take priority over global
            conversions.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.6fr)]">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search items or SKUs"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-[28rem] space-y-1 overflow-y-auto">
              {visibleProducts.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                    selectedId === product.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    setSelectedId(product.id);
                    setAppliesTo("whole");
                    resetEditor();
                  }}
                >
                  <span className="min-w-0 truncate font-medium">{product.name}</span>
                  <Badge variant="outline">{product.unit}</Badge>
                </button>
              ))}
              {!visibleProducts.length && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No items found.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            {selectedProduct ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{selectedProduct.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Stock unit:{" "}
                      <span className="font-medium text-foreground">{selectedProduct.unit}</span>
                    </p>
                  </div>
                  <div className="w-full max-w-xs space-y-1">
                    <Label>Applies to</Label>
                    <Select
                      value={appliesTo}
                      onValueChange={(value) => {
                        setAppliesTo(value);
                        resetEditor();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whole">Whole item</SelectItem>
                        {itemVariants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.name}
                            {variant.sku ? ` (${variant.sku})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Unit</th>
                        <th className="px-3 py-2 font-medium">Rule</th>
                        <th className="px-3 py-2 font-medium">Used for</th>
                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border">
                        <td className="px-3 py-2">{selectedProduct.unit}</td>
                        <td className="px-3 py-2">
                          1 {selectedProduct.unit} = 1 {selectedProduct.unit}
                        </td>
                        <td className="px-3 py-2">
                          {appliesTo === "whole" ? "Whole item" : "Selected variant"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="secondary">Base</Badge>
                        </td>
                      </tr>
                      {selectedConversions.map((conversion) => (
                        <tr key={conversion.id} className="border-t border-border">
                          <td className="px-3 py-2">{conversion.from_unit}</td>
                          <td className="px-3 py-2">
                            1 {conversion.from_unit} = {conversion.factor} {selectedProduct.unit}
                          </td>
                          <td className="px-3 py-2">
                            {appliesTo === "whole" ? "Whole item" : "Selected variant"}
                          </td>
                          <td className="space-x-2 px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => editConversion(conversion)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void deleteConversion(conversion.id)}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!selectedConversions.length && !editingId && (
                  <p className="text-sm text-muted-foreground">
                    No conversions yet. Example: 1 box = 12 pieces.
                  </p>
                )}
                <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                  <h4 className="text-sm font-semibold">
                    {editingId ? "Edit conversion" : "Add conversion"}
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-1">
                      <Label htmlFor="conversion-unit">Unit</Label>
                      <Input
                        id="conversion-unit"
                        placeholder="box"
                        value={sourceUnit}
                        onChange={(event) => setSourceUnit(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="conversion-factor">
                        1 {sourceUnit || "unit"} = X {selectedProduct.unit}
                      </Label>
                      <Input
                        id="conversion-factor"
                        type="number"
                        min="0"
                        step="any"
                        value={factor}
                        onChange={(event) => setFactor(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetEditor}>
                      Cancel
                    </Button>
                    <Button onClick={() => void saveConversion()}>
                      {editingId ? "Save changes" : "Save"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Choose an item to view or add its conversions.
              </p>
            )}
          </div>
        </div>
      </section>
      <ResourcePage
        illustration="inventory"
        table="units_of_measure"
        title="Units of Measure"
        description={description}
        columns={unitColumns}
        fields={unitFields}
        searchKeys={["code", "name", "category"]}
        orderBy="code"
      />
      <ResourcePage
        table="unit_conversions"
        title="Unit Conversions"
        description="Examples: 1 kg = 1000 g, 1 L = 1000 ml, 1 case = 24 pcs, 1 dozen = 12 pcs."
        columns={convColumns}
        fields={convFields}
        searchKeys={["from_unit", "to_unit"]}
        orderBy="created_at"
      />
    </div>
  );
}
