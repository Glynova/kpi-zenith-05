import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useComponentOptions, type ComponentOption } from "@/components/made-from-section";
import {
  RULE_LABEL,
  fetchAddonGroups,
  type AddonGroup,
  type AddonOption,
  type AddonRule,
} from "@/lib/addons";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { normalizeUnit, toStockUnit, unitsFor } from "@/lib/units";

export function optionCost(option: Pick<AddonOption, "ingredients">, catalog: ComponentOption[]) {
  let total = 0;
  for (const i of option.ingredients) {
    const c = catalog.find(
      (x) => x.productId === i.productId && x.variantId === (i.variantId ?? null),
    );
    if (!c) continue;
    const q = toStockUnit(Number(i.quantity), i.unit || c.unit, c.unit);
    if (q != null) total += q * c.cost;
  }
  return total;
}

type Props = {
  businessId: string | null;
  currency: string;
  selected: string[];
  setSelected: (ids: string[]) => void;
};

const blankGroup = (): AddonGroup => ({
  id: "",
  name: "",
  rule: "pick1_optional",
  usage: 0,
  options: [{ key: crypto.randomUUID(), name: "", extra_price: 0, ingredients: [] }],
});

export function AddonGroupsSection({ businessId, currency, selected, setSelected }: Props) {
  const [open, setOpen] = useState(selected.length > 0);
  const [editing, setEditing] = useState<AddonGroup | null>(null);
  const qc = useQueryClient();
  const { data: groups = [] } = useQuery({
    queryKey: ["addon-groups", businessId],
    enabled: !!businessId,
    queryFn: () => fetchAddonGroups(businessId!),
  });
  const { data: catalog = [] } = useComponentOptions(businessId);
  const fmt = (n: number) => formatCurrency(n, currency);

  async function save(g: AddonGroup) {
    if (!g.name.trim()) return toast.error("Give the group a name");
    const opts = g.options.filter((o) => o.name.trim());
    if (!opts.length) return toast.error("Add at least one option");
    const names = opts.map((o) => o.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return toast.error("Option names must be different");
    for (const o of opts)
      for (const i of o.ingredients) {
        const c = catalog.find((x) => x.productId === i.productId && x.variantId === i.variantId);
        if (!i.productId || !c) return toast.error(`Choose an ingredient for ${o.name}`);
        if (!(Number(i.quantity) > 0))
          return toast.error(`Quantity for ${o.name} must be above zero`);
        if (toStockUnit(1, i.unit || c.unit, c.unit) == null)
          return toast.error(`${i.unit} can't convert to ${c.unit} for ${c.label}`);
      }
    if (
      g.id &&
      g.usage > 1 &&
      !window.confirm(`This group is used by ${g.usage} items. Apply changes to all of them?`)
    )
      return;
    try {
      let groupId = g.id;
      if (groupId) {
        const { error } = await db
          .from("addon_groups")
          .update({ name: g.name.trim(), rule: g.rule })
          .eq("id", groupId);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from("addon_groups")
          .insert({ business_id: businessId, name: g.name.trim(), rule: g.rule })
          .select("id")
          .single();
        if (error) throw error;
        groupId = data.id;
      }
      const original = groups.find((x) => x.id === groupId)?.options ?? [];
      for (const removed of original.filter((o) => !opts.some((x) => x.id === o.id))) {
        // Delete if never sold; otherwise archive so history keeps it.
        const del = await db.from("addon_options").delete().eq("id", removed.id!).select("id");
        if (del.error || !del.data?.length)
          await db.from("addon_options").update({ archived: true }).eq("id", removed.id!);
      }
      for (const [sort, o] of opts.entries()) {
        let optionId = o.id;
        const row = {
          name: o.name.trim(),
          extra_price: Number(o.extra_price || 0),
          kitchen_note: o.kitchen_note || null,
          sort,
        };
        if (optionId) {
          const { error } = await db.from("addon_options").update(row).eq("id", optionId);
          if (error) throw error;
          await db.from("addon_option_components").delete().eq("option_id", optionId);
        } else {
          const { data, error } = await db
            .from("addon_options")
            .insert({ ...row, business_id: businessId, group_id: groupId })
            .select("id")
            .single();
          if (error) throw error;
          optionId = data.id;
        }
        if (o.ingredients.length) {
          const { error } = await db.from("addon_option_components").insert(
            o.ingredients.map((i) => {
              const c = catalog.find(
                (x) => x.productId === i.productId && x.variantId === i.variantId,
              )!;
              const unit = i.unit || c.unit;
              return {
                business_id: businessId,
                option_id: optionId,
                component_product_id: i.productId,
                variant_id: i.variantId,
                quantity: toStockUnit(Number(i.quantity), unit, c.unit),
                entered_quantity: Number(i.quantity),
                entered_unit: unit,
              };
            }),
          );
          if (error) throw error;
        }
      }
      toast.success("Add-on group saved");
      setEditing(null);
      if (!selected.includes(groupId)) setSelected([...selected, groupId]);
      void qc.invalidateQueries({ queryKey: ["addon-groups", businessId] });
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not save the group");
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between font-semibold"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Add-ons and extras {selected.length ? `(${selected.length})` : ""}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(g.id)}
                  onCheckedChange={(v) =>
                    setSelected(
                      v === true ? [...selected, g.id] : selected.filter((x) => x !== g.id),
                    )
                  }
                />
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-muted-foreground">
                  {RULE_LABEL[g.rule]} · {g.options.map((o) => o.name).join(", ")} · used by{" "}
                  {g.usage}
                </span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(structuredClone(g))}
              >
                Edit
              </Button>
            </div>
          ))}
          {!groups.length && (
            <p className="text-sm text-muted-foreground">
              No add-on groups yet. Make one, like "Size" or "Extras".
            </p>
          )}
          {!editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(blankGroup())}
            >
              New add-on group
            </Button>
          )}
          {editing && (
            <GroupEditor
              group={editing}
              setGroup={setEditing}
              catalog={catalog}
              fmt={fmt}
              onSave={() => void save(editing)}
              onCancel={() => setEditing(null)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function GroupEditor({
  group,
  setGroup,
  catalog,
  fmt,
  onSave,
  onCancel,
}: {
  group: AddonGroup;
  setGroup: (g: AddonGroup) => void;
  catalog: ComponentOption[];
  fmt: (n: number) => string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const setOption = (key: string, patch: Partial<AddonOption>) =>
    setGroup({
      ...group,
      options: group.options.map((o) => (o.key === key ? { ...o, ...patch } : o)),
    });
  return (
    <div className="space-y-3 rounded-md border border-primary/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Group name"
          placeholder="Group name (e.g. Size)"
          value={group.name}
          onChange={(e) => setGroup({ ...group, name: e.target.value })}
        />
        <Select
          value={group.rule}
          onValueChange={(v) => setGroup({ ...group, rule: v as AddonRule })}
        >
          <SelectTrigger aria-label="Group rule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RULE_LABEL) as AddonRule[]).map((r) => (
              <SelectItem key={r} value={r}>
                {RULE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {group.id && group.usage > 1 && (
        <p className="text-xs text-muted-foreground">
          Shared by {group.usage} items. Changes apply to all of them.
        </p>
      )}
      {group.options.map((o) => {
        const cost = optionCost(o, catalog);
        const price = Number(o.extra_price || 0);
        const below = price < cost;
        return (
          <div key={o.key} className="space-y-2 rounded-md bg-muted/40 p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_100px_auto] gap-2">
              <Input
                aria-label="Option name"
                placeholder="Option (e.g. Large)"
                value={o.name}
                onChange={(e) => setOption(o.key, { name: e.target.value })}
              />
              <Input
                aria-label="Extra price"
                type="number"
                min="0"
                step="any"
                value={o.extra_price}
                onChange={(e) => setOption(o.key, { extra_price: Number(e.target.value) })}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove option"
                onClick={() =>
                  setGroup({ ...group, options: group.options.filter((x) => x.key !== o.key) })
                }
              >
                ×
              </Button>
            </div>
            {o.ingredients.map((i) => {
              const c = catalog.find(
                (x) => x.productId === i.productId && x.variantId === i.variantId,
              );
              const unit = i.unit || c?.unit || "pcs";
              const setIng = (patch: Partial<typeof i>) =>
                setOption(o.key, {
                  ingredients: o.ingredients.map((x) => (x.key === i.key ? { ...x, ...patch } : x)),
                });
              return (
                <div
                  key={i.key}
                  className="grid grid-cols-[minmax(0,1fr)_80px_80px_auto] gap-2 pl-3"
                >
                  <Select
                    value={c?.value ?? "none"}
                    onValueChange={(v) => {
                      const n = catalog.find((x) => x.value === v);
                      setIng({
                        productId: n?.productId ?? "",
                        variantId: n?.variantId ?? null,
                        unit: n?.unit ?? "",
                      });
                    }}
                  >
                    <SelectTrigger aria-label="Option ingredient">
                      <SelectValue placeholder="Ingredient" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.map((x) => (
                        <SelectItem key={x.value} value={x.value}>
                          {x.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label="Ingredient quantity"
                    type="number"
                    min="0"
                    step="any"
                    value={i.quantity}
                    onChange={(e) => setIng({ quantity: Number(e.target.value) })}
                  />
                  <Select value={normalizeUnit(unit)} onValueChange={(v) => setIng({ unit: v })}>
                    <SelectTrigger aria-label="Ingredient unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitsFor(c?.unit ?? unit).map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove ingredient"
                    onClick={() =>
                      setOption(o.key, {
                        ingredients: o.ingredients.filter((x) => x.key !== i.key),
                      })
                    }
                  >
                    ×
                  </Button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 pl-3">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  setOption(o.key, {
                    ingredients: [
                      ...o.ingredients,
                      {
                        key: crypto.randomUUID(),
                        productId: "",
                        variantId: null,
                        quantity: 1,
                        unit: "",
                      },
                    ],
                  })
                }
              >
                + Ingredient used
              </Button>
              <span className={`text-xs ${below ? "text-destructive" : "text-muted-foreground"}`}>
                Cost {fmt(cost)} ·{" "}
                {price > 0 ? `Margin ${(((price - cost) / price) * 100).toFixed(0)}%` : "No charge"}
              </span>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setGroup({
              ...group,
              options: [
                ...group.options,
                { key: crypto.randomUUID(), name: "", extra_price: 0, ingredients: [] },
              ],
            })
          }
        >
          Add option
        </Button>
        <Button type="button" size="sm" onClick={onSave}>
          Save group
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
