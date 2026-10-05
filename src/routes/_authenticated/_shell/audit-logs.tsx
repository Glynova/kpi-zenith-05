import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_shell/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — Daraven ERP" },
      { name: "description", content: "Permanent record of who changed what, and when." },
      { property: "og:title", content: "Audit Logs — Daraven ERP" },
      { property: "og:description", content: "Permanent record of who changed what, and when." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { businessId } = useBusiness();
  const [action, setAction] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Row | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["audit", businessId, action, moduleName, user, from, to],
    enabled: !!businessId,
    queryFn: async () => {
      let q = db.from("audit_logs").select("*").eq("business_id", businessId);
      if (action) q = q.ilike("action", `%${action}%`);
      if (moduleName) q = q.ilike("module", `%${moduleName}%`);
      if (user) q = q.ilike("user_email", `%${user}%`);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", `${to}T23:59:59`);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filter = (label: string, value: string, set: (v: string) => void, type = "text") => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1.5" type={type} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" description="Permanent record of who changed what, and when. Entries can't be edited or deleted." />
      <div className="grid gap-3 sm:grid-cols-5">
        {filter("Action (e.g. VOID)", action, setAction)}
        {filter("Area", moduleName, setModuleName)}
        {filter("User email", user, setUser)}
        {filter("From", from, setFrom, "date")}
        {filter("To", to, setTo, "date")}
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Area</TableHead><TableHead>Record</TableHead><TableHead>IP</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell>{r.user_email ?? "System"}</TableCell>
                  <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                  <TableCell>{r.module}</TableCell>
                  <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{r.record_id}</TableCell>
                  <TableCell className="text-xs">{r.ip_address ?? "—"}</TableCell>
                </TableRow>
              ))}
              {!isLoading && !data.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No entries match.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{open?.action} · {open?.module}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">{formatDateTime(open?.created_at)} · {open?.user_email ?? "System"} · {open?.record_id}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["old_value", "new_value"] as const).map((k) => (
              <div key={k} className="min-w-0">
                <p className="mb-1 text-xs font-medium">{k === "old_value" ? "Before" : "After"}</p>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs">{open?.[k] ? JSON.stringify(open[k], null, 2) : "—"}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
