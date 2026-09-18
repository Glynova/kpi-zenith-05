/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PROMO_DURATIONS } from "@/lib/affiliate";
import { peso, shortDate } from "@/lib/partner-format";
import {
  adminPromoCodes,
  setPromoCodeActive,
  upsertPromoCode,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/promo-codes")({
  head: () => ({
    meta: [
      { title: "Promo Codes — Daraven ERP" },
      {
        name: "description",
        content: "Create, edit and disable promo codes and review redemptions.",
      },
      { property: "og:title", content: "Promo Codes — Daraven ERP" },
      {
        property: "og:description",
        content: "Create, edit and disable promo codes and review redemptions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPromoCodes,
});

const PLANS = ["free", "pro", "business"] as const;

function AdminPromoCodes() {
  const qc = useQueryClient();
  const fetchCodes = useServerFn(adminPromoCodes);
  const upsert = useServerFn(upsertPromoCode);
  const toggle = useServerFn(setPromoCodeActive);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-promo-codes"],
    queryFn: () => fetchCodes(),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin-promo-codes"] });

  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: (input: any) => upsert({ data: input }),
    onSuccess: () => {
      toast.success("Promo code saved");
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the promo code"),
  });

  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => toggle({ data: input }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Could not update the code"),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const codes = (data.codes ?? []) as any[];
  const partners = (data.partners ?? []) as any[];
  const redemptions = (data.redemptions ?? []) as any[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promo codes"
        description="Discounts applied at checkout, optionally attributed to an affiliate partner."
      />

      <DataCard
        title={`${codes.length} codes`}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> New code
          </Button>
        }
        columns={[
          "Code",
          "Discount",
          "Duration",
          "Plans",
          "Partner",
          "Used",
          "Window",
          "Active",
          "",
        ]}
        rows={codes}
        empty={{ title: "No promo codes yet", description: "Create one to run a campaign." }}
        renderRow={(c: any) => (
          <TableRow key={c.id}>
            <TableCell>
              <div className="font-mono font-medium">{c.code}</div>
              {c.description && (
                <div className="max-w-[14rem] truncate text-xs text-muted-foreground">
                  {c.description}
                </div>
              )}
            </TableCell>
            <TableCell className="tabular-nums">
              {c.discount_type === "percentage"
                ? `${Number(c.discount_value)}%`
                : peso(c.discount_value)}
            </TableCell>
            <TableCell className="capitalize text-muted-foreground">
              {String(c.duration ?? "").replace(/_/g, " ")}
            </TableCell>
            <TableCell className="capitalize text-muted-foreground">
              {(c.applicable_plans ?? []).length ? (c.applicable_plans ?? []).join(", ") : "All"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {partners.find((p) => p.id === c.affiliate_partner_id)?.display_name ?? "—"}
            </TableCell>
            <TableCell className="tabular-nums">
              {c.redemption_count ?? 0}
              {c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {shortDate(c.starts_at)} – {shortDate(c.ends_at)}
            </TableCell>
            <TableCell>
              <Switch
                checked={!!c.active}
                onCheckedChange={(v) => setActive.mutate({ id: c.id, active: v })}
              />
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(c);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
            </TableCell>
          </TableRow>
        )}
      />

      <DataCard
        title="Recent redemptions"
        columns={["Code", "Workspace", "Discount", "Status", "Redeemed"]}
        rows={redemptions}
        empty={{ title: "No redemptions yet" }}
        renderRow={(r: any) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">
              {codes.find((c) => c.id === r.promo_code_id)?.code ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{r.business_id}</TableCell>
            <TableCell className="tabular-nums">{peso(r.discount_amount ?? 0)}</TableCell>
            <TableCell>
              <StatusBadge status={r.status ?? "applied"} />
            </TableCell>
            <TableCell className="text-muted-foreground">{shortDate(r.created_at)}</TableCell>
          </TableRow>
        )}
      />

      <PromoDialog
        open={open}
        code={editing}
        partners={partners}
        pending={save.isPending}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={(input) => save.mutate(input)}
      />
    </div>
  );
}

function PromoDialog({
  open,
  code,
  partners,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  code: any;
  partners: any[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: any) => void;
}) {
  const [form, setForm] = useState<any>(blank());

  useEffect(() => {
    if (!open) return;
    setForm(
      code
        ? {
            id: code.id,
            code: code.code ?? "",
            description: code.description ?? "",
            discountType: code.discount_type ?? "percentage",
            discountValue: String(code.discount_value ?? ""),
            duration: code.duration ?? "first_payment",
            applicablePlans: code.applicable_plans ?? [],
            minAmount: code.min_amount != null ? String(code.min_amount) : "",
            startsAt: code.starts_at ? String(code.starts_at).slice(0, 10) : "",
            endsAt: code.ends_at ? String(code.ends_at).slice(0, 10) : "",
            maxRedemptions: code.max_redemptions != null ? String(code.max_redemptions) : "",
            maxPerBusiness: String(code.max_per_business ?? 1),
            active: !!code.active,
            affiliatePartnerId: code.affiliate_partner_id ?? "none",
          }
        : blank(),
    );
  }, [open, code]);

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const submit = () => {
    if (form.code.trim().length < 3) return toast.error("Code must be at least 3 characters");
    const value = Number(form.discountValue);
    if (!value || value <= 0) return toast.error("Enter a discount value");
    onSubmit({
      ...(form.id ? { id: form.id } : {}),
      code: form.code.trim().toUpperCase(),
      description: form.description || undefined,
      discountType: form.discountType,
      discountValue: value,
      duration: form.duration,
      applicablePlans: form.applicablePlans,
      minAmount: form.minAmount ? Number(form.minAmount) : null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      maxPerBusiness: Number(form.maxPerBusiness) || 1,
      active: form.active,
      affiliatePartnerId:
        form.affiliatePartnerId && form.affiliatePartnerId !== "none"
          ? form.affiliatePartnerId
          : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{code ? "Edit promo code" : "New promo code"}</DialogTitle>
          <DialogDescription>
            Discounts are applied to the subscription price and reduce commissionable revenue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              placeholder="LAUNCH20"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Attributed partner</Label>
            <Select
              value={form.affiliatePartnerId}
              onValueChange={(v) => set({ affiliatePartnerId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name} ({p.referral_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="promo-desc">Description</Label>
            <Textarea
              id="promo-desc"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Internal note about this campaign"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Discount type</Label>
            <Select value={form.discountType} onValueChange={(v) => set({ discountType: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-value">
              {form.discountType === "percentage" ? "Percent off" : "Amount off (₱)"}
            </Label>
            <Input
              id="promo-value"
              type="number"
              min={0}
              step="0.01"
              value={form.discountValue}
              onChange={(e) => set({ discountValue: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={form.duration} onValueChange={(v) => set({ duration: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROMO_DURATIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-min">Minimum amount (₱)</Label>
            <Input
              id="promo-min"
              type="number"
              min={0}
              value={form.minAmount}
              onChange={(e) => set({ minAmount: e.target.value })}
              placeholder="No minimum"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-start">Starts</Label>
            <Input
              id="promo-start"
              type="date"
              value={form.startsAt}
              onChange={(e) => set({ startsAt: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-end">Ends</Label>
            <Input
              id="promo-end"
              type="date"
              value={form.endsAt}
              onChange={(e) => set({ endsAt: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-max">Max redemptions</Label>
            <Input
              id="promo-max"
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) => set({ maxRedemptions: e.target.value })}
              placeholder="Unlimited"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-per">Max per workspace</Label>
            <Input
              id="promo-per"
              type="number"
              min={1}
              value={form.maxPerBusiness}
              onChange={(e) => set({ maxPerBusiness: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Applicable plans</Label>
            <div className="flex flex-wrap gap-4">
              {PLANS.map((plan) => (
                <label key={plan} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={form.applicablePlans.includes(plan)}
                    onCheckedChange={(v) =>
                      set({
                        applicablePlans: v
                          ? [...form.applicablePlans, plan]
                          : form.applicablePlans.filter((p: string) => p !== plan),
                      })
                    }
                  />
                  {plan}
                </label>
              ))}
              <span className="text-xs text-muted-foreground">Leave empty to allow all plans.</span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
            <span className="text-sm">Active</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : code ? "Save changes" : "Create code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blank() {
  return {
    code: "",
    description: "",
    discountType: "percentage",
    discountValue: "",
    duration: "first_payment",
    applicablePlans: [] as string[],
    minAmount: "",
    startsAt: "",
    endsAt: "",
    maxRedemptions: "",
    maxPerBusiness: "1",
    active: true,
    affiliatePartnerId: "none",
  };
}
