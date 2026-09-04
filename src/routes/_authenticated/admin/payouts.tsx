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
import { peso, shortDate } from "@/lib/partner-format";
import {
  adminAffiliates,
  createAffiliatePayout,
  setCommissionStatus,
  updateAffiliatePayout,
} from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/payouts")({
  head: () => ({
    meta: [
      { title: "Affiliate Payouts — Daraven ERP" },
      { name: "description", content: "Pending partner balances and payout batch processing." },
      { property: "og:title", content: "Affiliate Payouts — Daraven ERP" },
      { property: "og:description", content: "Pending partner balances and payout batch processing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPayouts,
});

function AdminPayouts() {
  const qc = useQueryClient();
  const fetchAffiliates = useServerFn(adminAffiliates);
  const createPayout = useServerFn(createAffiliatePayout);
  const updatePayout = useServerFn(updateAffiliatePayout);
  const setStatus = useServerFn(setCommissionStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-affiliates"],
    queryFn: () => fetchAffiliates(),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin-affiliates"] });

  const [processing, setProcessing] = useState<any>(null);

  const create = useMutation({
    mutationFn: (partnerId: string) => createPayout({ data: { partnerId } }),
    onSuccess: (r: any) => {
      toast.success(`Payout batch created for ${peso(r?.amount ?? 0)}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the payout"),
  });

  const update = useMutation({
    mutationFn: (input: any) => updatePayout({ data: input }),
    onSuccess: () => {
      toast.success("Payout updated");
      setProcessing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the payout"),
  });

  const approve = useMutation({
    mutationFn: (ids: string[]) => setStatus({ data: { commissionIds: ids, status: "approved" } }),
    onSuccess: () => {
      toast.success("Commissions approved");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not approve the commissions"),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  const partners = (data.partners ?? []) as any[];
  const payouts = (data.payouts ?? []) as any[];
  const commissions = (data.commissions ?? []) as any[];
  const partnerName = (id: string) =>
    partners.find((p) => p.id === id)?.display_name ?? "—";
  const pendingCommissions = commissions.filter((c) => c.status === "pending");
  const owed = partners.reduce((s, p) => s + Number(p.payout_balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts"
        description="Approve commissions, batch them into payouts and mark them settled."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Commission owed" value={peso(owed)} />
        <StatCard label="Pending approval" value={pendingCommissions.length} />
        <StatCard
          label="Awaiting settlement"
          value={peso(
            payouts
              .filter((p) => p.status === "pending" || p.status === "processing")
              .reduce((s, p) => s + Number(p.amount ?? 0), 0),
          )}
        />
        <StatCard
          label="Paid out"
          value={peso(
            payouts.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount ?? 0), 0),
          )}
        />
      </div>

      <DataCard
        title="Partner balances"
        description="Creating a batch locks the partner's unpaid commissions into a payout."
        actions={
          pendingCommissions.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={approve.isPending}
              onClick={() => approve.mutate(pendingCommissions.map((c) => c.id))}
            >
              Approve {pendingCommissions.length} pending
            </Button>
          ) : undefined
        }
        columns={["Partner", "Status", "Referrals", "Lifetime", "Balance", ""]}
        rows={partners}
        empty={{ title: "No partners yet" }}
        renderRow={(p: any) => (
          <TableRow key={p.id}>
            <TableCell>
              <div className="font-medium">{p.display_name}</div>
              <div className="text-xs text-muted-foreground">{p.email}</div>
            </TableCell>
            <TableCell>
              <StatusBadge status={p.status} />
            </TableCell>
            <TableCell className="tabular-nums">{p.referral_count}</TableCell>
            <TableCell className="tabular-nums">{peso(p.lifetime_commission)}</TableCell>
            <TableCell className="tabular-nums font-medium">{peso(p.payout_balance)}</TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                disabled={Number(p.payout_balance ?? 0) <= 0 || create.isPending}
                onClick={() => create.mutate(p.id)}
              >
                Create payout
              </Button>
            </TableCell>
          </TableRow>
        )}
      />

      <DataCard
        title={`Payout batches (${payouts.length})`}
        columns={["Partner", "Amount", "Status", "Method", "Reference", "Created", "Paid", ""]}
        rows={payouts}
        empty={{ title: "No payouts yet" }}
        renderRow={(p: any) => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{partnerName(p.partner_id)}</TableCell>
            <TableCell className="tabular-nums">{peso(p.amount)}</TableCell>
            <TableCell>
              <StatusBadge status={p.status} />
            </TableCell>
            <TableCell className="capitalize text-muted-foreground">{p.method ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {p.reference ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{shortDate(p.created_at)}</TableCell>
            <TableCell className="text-muted-foreground">{shortDate(p.paid_at)}</TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={() => setProcessing(p)}>
                Process
              </Button>
            </TableCell>
          </TableRow>
        )}
      />

      <ProcessDialog
        payout={processing}
        partnerName={processing ? partnerName(processing.partner_id) : ""}
        pending={update.isPending}
        onClose={() => setProcessing(null)}
        onSubmit={(input) => update.mutate(input)}
      />
    </div>
  );
}

function ProcessDialog({
  payout,
  partnerName,
  pending,
  onClose,
  onSubmit,
}: {
  payout: any;
  partnerName: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: any) => void;
}) {
  const [status, setStatus] = useState("processing");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (payout) {
      setStatus(payout.status === "pending" ? "processing" : payout.status);
      setMethod(payout.method ?? "");
      setReference(payout.reference ?? "");
    }
  }, [payout]);

  return (
    <Dialog open={!!payout} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Process payout</DialogTitle>
          <DialogDescription>
            {partnerName} · {peso(payout?.amount ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Marking a batch paid settles every commission inside it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payout-method">Method</Label>
            <Input
              id="payout-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="Bank transfer, GCash, PayPal…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payout-ref">Reference</Label>
            <Input
              id="payout-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference"
            />
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
                payoutId: payout.id,
                status,
                method: method || undefined,
                reference: reference || undefined,
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
