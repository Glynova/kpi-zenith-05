/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/page-header";
import { DataCard, TableCell, TableRow } from "@/components/portal-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminEvents } from "@/lib/platform-admin.functions";
import { dateTime } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  head: () => ({
    meta: [
      { title: "Platform Activity — Daraven ERP" },
      { name: "description", content: "Billing webhook events and the platform audit log." },
      { property: "og:title", content: "Platform Activity — Daraven ERP" },
      { property: "og:description", content: "Billing webhook events and the platform audit log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminActivity,
});

function AdminActivity() {
  const fetchEvents = useServerFn(adminEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-events"],
    queryFn: () => fetchEvents(),
  });
  const [q, setQ] = useState("");

  const events = useMemo(() => {
    const all = (data?.events ?? []) as any[];
    const term = q.trim().toLowerCase();
    return term
      ? all.filter((e) => `${e.event_type} ${e.business_name}`.toLowerCase().includes(term))
      : all;
  }, [data, q]);

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Billing webhook events and workspace audit trails across the platform."
      />

      <Tabs defaultValue="billing" className="space-y-4">
        <TabsList>
          <TabsTrigger value="billing">Billing events</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="billing">
          <DataCard
            title={`${events.length} events`}
            actions={
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search event or workspace…"
                className="w-56"
              />
            }
            columns={["Event", "Workspace", "External ID", "When"]}
            rows={events}
            empty={{ title: "No billing events yet" }}
            renderRow={(e: any) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Badge variant="outline">{e.event_type}</Badge>
                </TableCell>
                <TableCell className="font-medium">{e.business_name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {e.external_event_id ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{dateTime(e.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>

        <TabsContent value="audit">
          <DataCard
            title="Recent audit entries"
            columns={["Action", "Module", "Workspace", "User", "When"]}
            rows={(data.auditLogs ?? []) as any[]}
            empty={{ title: "No audit entries yet" }}
            renderRow={(l: any) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium capitalize">
                  {String(l.action ?? "").replace(/_/g, " ")}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {l.module ?? "—"}
                </TableCell>
                <TableCell>{l.business_name}</TableCell>
                <TableCell className="text-muted-foreground">{l.user_email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{dateTime(l.created_at)}</TableCell>
              </TableRow>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
