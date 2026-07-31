/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatDate, titleCase, todayISO } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function NotificationsPage() {
  const { businessId, canWrite } = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["notifications", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["notifications", businessId] });
  }

  const toggleRead = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await db
        .from("notifications")
        .update({ is_read: !row.is_read })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("business_id", businessId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await db.from("notifications").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const scan = useMutation({
    mutationFn: async () => {
      const today = todayISO();
      const [{ data: products }, { data: invoices }, { data: receivables }] = await Promise.all([
        db.from("products").select("id,name,stock,reorder_level").eq("business_id", businessId),
        db
          .from("invoices")
          .select("id,invoice_number,due_date,total,paid,status")
          .eq("business_id", businessId),
        db
          .from("accounts_receivable")
          .select("id,amount,paid,due_date,status")
          .eq("business_id", businessId),
      ]);

      const alerts: Row[] = [];
      (products ?? []).forEach((p: Row) => {
        if (Number(p.stock) <= 0) {
          alerts.push({
            type: "out_of_stock",
            title: `${p.name} is out of stock`,
            message: "Reorder this product to avoid lost sales.",
            link: "/products",
          });
        } else if (Number(p.stock) <= Number(p.reorder_level ?? 0)) {
          alerts.push({
            type: "low_stock",
            title: `${p.name} is below reorder level`,
            message: `Stock is ${p.stock}, reorder level is ${p.reorder_level}.`,
            link: "/products",
          });
        }
      });
      (invoices ?? []).forEach((i: Row) => {
        if (
          i.due_date &&
          i.due_date < today &&
          Number(i.paid ?? 0) < Number(i.total ?? 0) &&
          i.status !== "cancelled"
        ) {
          alerts.push({
            type: "invoice_due",
            title: `Invoice ${i.invoice_number} is overdue`,
            message: `Due ${formatDate(i.due_date)} and still unpaid.`,
            link: "/invoices",
          });
        }
      });
      (receivables ?? []).forEach((r: Row) => {
        if (r.due_date && r.due_date < today && Number(r.paid ?? 0) < Number(r.amount ?? 0)) {
          alerts.push({
            type: "debt_due",
            title: "Customer debt is overdue",
            message: `Outstanding since ${formatDate(r.due_date)}.`,
            link: "/receivables",
          });
        }
      });

      const existing = new Set((data ?? []).filter((n) => !n.is_read).map((n) => n.title));
      const fresh = alerts.filter((a) => !existing.has(a.title));
      if (!fresh.length) return 0;

      const { error } = await db
        .from("notifications")
        .insert(fresh.map((a) => ({ ...a, business_id: businessId, is_read: false })));
      if (error) throw error;
      return fresh.length;
    },
    onSuccess: (count) => {
      toast.success(count ? `${count} new alert(s) created` : "Everything looks healthy");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message ?? "Scan failed"),
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((n) =>
      [n.title, n.message, n.type].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [data, search]);

  const unread = data.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Stock, invoice, debt and payroll alerts for your team."
        actions={
          <>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => scan.mutate()}
                disabled={scan.isPending}
              >
                <RefreshCw className="size-4" /> {scan.isPending ? "Scanning..." : "Scan for alerts"}
              </Button>
            )}
            {canWrite && unread > 0 && (
              <Button size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
                <CheckCheck className="size-4" /> Mark all read
              </Button>
            )}
          </>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alerts..."
            className="pl-9"
          />
        </div>
        <Badge variant="secondary">{unread} unread</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Run a scan to generate low-stock and overdue payment alerts."
          action={canWrite ? <Button onClick={() => scan.mutate()}>Scan for alerts</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <div
              key={n.id}
              className={`surface-panel flex items-start gap-3 p-4 ${n.is_read ? "opacity-60" : ""}`}
            >
              <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{n.title}</p>
                  <Badge variant="secondary">{titleCase(String(n.type))}</Badge>
                  {!n.is_read && <Badge>New</Badge>}
                </div>
                {n.message && <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
              </div>
              {canWrite && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggleRead.mutate(n)}>
                    {n.is_read ? "Unread" : "Read"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(n)} aria-label="Delete">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_shell/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — KPIOptiva" },
      { name: "description", content: "Low stock, overdue invoice and debt alerts for your team." },
      { property: "og:title", content: "Notifications — KPIOptiva" },
      {
        property: "og:description",
        content: "Low stock, overdue invoice and debt alerts for your team.",
      },
    ],
  }),
  component: NotificationsPage,
});
