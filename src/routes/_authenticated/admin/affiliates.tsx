/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/portal-shell";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { COMMISSION_DURATIONS } from "@/lib/affiliate";
import { peso, shortDate } from "@/lib/partner-format";
import {
  adminAffiliates,
  reviewAffiliateApplication,
  updateAffiliateDefaults,
  updateAffiliatePartner,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/affiliates")({
  head: () => ({
    meta: [
      { title: "Affiliate Programme — Daraven ERP" },
      {
        name: "description",
        content: "Review partner applications and manage commission settings.",
      },
      { property: "og:title", content: "Affiliate Programme — Daraven ERP" },
      {
        property: "og:description",
        content: "Review partner applications and manage commission settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAffiliates,
});

function AdminAffiliates() {
  const qc = useQueryClient();
  const fetchAffiliates = useServerFn(adminAffiliates);
  const review = useServerFn(reviewAffiliateApplication);
  const updatePartner = useServerFn(updateAffiliatePartner);
  const updateDefaults = useServerFn(updateAffiliateDefaults);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-affiliates"],
    queryFn: () => fetchAffiliates(),
  });

  const [reviewing, setReviewing] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin-affiliates"] });

  const reviewMutation = useMutation({
    mutationFn: (input: any) => review({ data: input }),
    onSuccess: (_r, input: any) => {
      toast.success(input.decision === "approved" ? "Partner approved" : "Application rejected");
      setReviewing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the decision"),
  });

  const partnerMutation = useMutation({
    mutationFn: (input: any) => updatePartner({ data: input }),
    onSuccess: () => {
      toast.success("Partner updated");
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the partner"),
  });

  const defaultsMutation = useMutation({
    mutationFn: (input: any) => updateDefaults({ data: input }),
    onSuccess: () => {
      toast.success("Defaults saved");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the defaults"),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const applications = (data.applications ?? []) as any[];
  const partners = (data.partners ?? []) as any[];
  const pending = applications.filter((a) => a.status === "pending");
  const defaults = (data.defaults ?? {}) as any;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliates"
        description="Review applications, tune commission terms and manage partner access."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending applications" value={pending.length} />
        <StatCard
          label="Active partners"
          value={partners.filter((p) => p.status === "active").length}
        />
        <StatCard
          label="Attributed revenue"
          value={peso(partners.reduce((s, p) => s + Number(p.attributed_revenue ?? 0), 0))}
        />
        <StatCard
          label="Commission owed"
          value={peso(partners.reduce((s, p) => s + Number(p.payout_balance ?? 0), 0))}
        />
      </div>

      <DataCard
        title={`Applications (${pending.length} pending)`}
        columns={["Applicant", "Company", "Audience", "Status", "Submitted", ""]}
        rows={applications}
        empty={{ title: "No applications yet" }}
        renderRow={(a: any) => (
          <TableRow key={a.id}>
            <TableCell>
              <div className="font-medium">{a.full_name}</div>
              <div className="text-xs text-muted-foreground">{a.email}</div>
            </TableCell>
            <TableCell className="text-muted-foreground">{a.company ?? "—"}</TableCell>
            <TableCell className="max-w-[18rem] truncate text-muted-foreground">
              {a.audience ?? "—"}
            </TableCell>
            <TableCell>
              <StatusBadge status={a.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{shortDate(a.created_at)}</TableCell>
            <TableCell className="text-right">
              {a.status === "pending" ? (
                <Button size="sm" variant="outline" onClick={() => setReviewing(a)}>
                  Review
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{shortDate(a.reviewed_at)}</span>
              )}
            </TableCell>
          </TableRow>
        )}
      />

      <DataCard
        title={`Partners (${partners.length})`}
        columns={["Partner", "Code", "Rate", "Referrals", "Lifetime", "Balance", "Status", ""]}
        rows={partners}
        empty={{ title: "No partners yet" }}
        renderRow={(p: any) => (
          <TableRow key={p.id}>
            <TableCell>
              <div className="font-medium">{p.display_name}</div>
              <div className="text-xs text-muted-foreground">{p.email}</div>
            </TableCell>
            <TableCell className="font-mono text-xs">{p.referral_code}</TableCell>
            <TableCell className="tabular-nums">{Number(p.commission_rate ?? 0)}%</TableCell>
            <TableCell className="tabular-nums">
              {p.active_count}/{p.referral_count}
            </TableCell>
            <TableCell className="tabular-nums">{peso(p.lifetime_commission)}</TableCell>
            <TableCell className="tabular-nums">{peso(p.payout_balance)}</TableCell>
            <TableCell>
              <StatusBadge status={p.status} />
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                Manage
              </Button>
            </TableCell>
          </TableRow>
        )}
      />

      <DefaultsCard
        rate={Number(defaults.default_commission_rate ?? 20)}
        duration={String(defaults.default_commission_duration ?? "12_months")}
        saving={defaultsMutation.isPending}
        onSave={(rate, duration) => defaultsMutation.mutate({ rate, duration })}
      />

      <ReviewDialog
        application={reviewing}
        pending={reviewMutation.isPending}
        onClose={() => setReviewing(null)}
        onSubmit={(input) => reviewMutation.mutate(input)}
        defaultRate={Number(defaults.default_commission_rate ?? 20)}
        defaultDuration={String(defaults.default_commission_duration ?? "12_months")}
      />

      <PartnerDialog
        partner={editing}
        pending={partnerMutation.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(input) => partnerMutation.mutate(input)}
      />
    </div>
  );
}

function DefaultsCard({
  rate,
  duration,
  saving,
  onSave,
}: {
  rate: number;
  duration: string;
  saving: boolean;
  onSave: (rate: number, duration: string) => void;
}) {
  const [r, setR] = useState(String(rate));
  const [d, setD] = useState(duration);
  useEffect(() => {
    setR(String(rate));
    setD(duration);
  }, [rate, duration]);

  return (
    <Card className="shadow-elevate-1">
      <CardHeader>
        <CardTitle className="text-base">Programme defaults</CardTitle>
        <p className="text-sm text-muted-foreground">
          Applied to newly approved partners unless you override them at approval.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="default-rate">Commission rate (%)</Label>
          <Input
            id="default-rate"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={r}
            onChange={(e) => setR(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Duration</Label>
          <Select value={d} onValueChange={setD}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMISSION_DURATIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={saving} onClick={() => onSave(Number(r) || 0, d)}>
          {saving ? "Saving…" : "Save defaults"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewDialog({
  application,
  pending,
  defaultRate,
  defaultDuration,
  onClose,
  onSubmit,
}: {
  application: any;
  pending: boolean;
  defaultRate: number;
  defaultDuration: string;
  onClose: () => void;
  onSubmit: (input: any) => void;
}) {
  const [rate, setRate] = useState(String(defaultRate));
  const [duration, setDuration] = useState(defaultDuration);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (application) {
      setRate(String(defaultRate));
      setDuration(defaultDuration);
      setNotes("");
    }
  }, [application, defaultRate, defaultDuration]);

  return (
    <Dialog open={!!application} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review application</DialogTitle>
          <DialogDescription>
            {application?.full_name} · {application?.email}
          </DialogDescription>
        </DialogHeader>
        {application && (
          <div className="space-y-4">
            {application.motivation && (
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {application.motivation}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="review-rate">Commission rate (%)</Label>
                <Input
                  id="review-rate"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMISSION_DURATIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review-notes">Internal notes</Label>
              <Textarea
                id="review-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this decision?"
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              onSubmit({
                applicationId: application.id,
                decision: "rejected",
                notes: notes || undefined,
              })
            }
          >
            Reject
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              onSubmit({
                applicationId: application.id,
                decision: "approved",
                notes: notes || undefined,
                commissionRate: Number(rate) || 0,
                commissionDuration: duration,
              })
            }
          >
            {pending ? "Saving…" : "Approve partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartnerDialog({
  partner,
  pending,
  onClose,
  onSubmit,
}: {
  partner: any;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: any) => void;
}) {
  const [status, setStatus] = useState("active");
  const [rate, setRate] = useState("20");
  const [duration, setDuration] = useState("12_months");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (partner) {
      setStatus(partner.status ?? "active");
      setRate(String(partner.commission_rate ?? 20));
      setDuration(partner.commission_duration ?? "12_months");
      setNotes(partner.notes ?? "");
    }
  }, [partner]);

  return (
    <Dialog open={!!partner} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage partner</DialogTitle>
          <DialogDescription>
            {partner?.display_name} · code {partner?.referral_code}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="partner-rate">Commission rate (%)</Label>
            <Input
              id="partner-rate"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMISSION_DURATIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="partner-notes">Internal notes</Label>
            <Textarea id="partner-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              onSubmit({
                partnerId: partner.id,
                status,
                commissionRate: Number(rate) || 0,
                commissionDuration: duration,
                notes,
              })
            }
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
