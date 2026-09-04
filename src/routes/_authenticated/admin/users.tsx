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
import { adminUsers } from "@/lib/platform-admin.functions";
import { shortDate } from "@/lib/partner-format";
import { ROLE_LABEL } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Platform Users — Daraven ERP" },
      { name: "description", content: "All user accounts and their workspace memberships." },
      { property: "og:title", content: "Platform Users — Daraven ERP" },
      { property: "og:description", content: "All user accounts and their workspace memberships." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsers,
});

function AdminUsers() {
  const fetchUsers = useServerFn(adminUsers);
  const { data, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers() });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = (data?.users ?? []) as any[];
    const term = q.trim().toLowerCase();
    return term
      ? all.filter((u) =>
          `${u.full_name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(term),
        )
      : all;
  }, [data, q]);

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Accounts and the workspaces they belong to." />
      <DataCard
        title={`${rows.length} users`}
        actions={
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="w-56"
          />
        }
        columns={["User", "Email", "Workspaces", "Joined"]}
        rows={rows}
        empty={{ title: "No users found" }}
        renderRow={(u: any) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {u.memberships.length === 0 && <span className="text-muted-foreground">—</span>}
                {u.memberships.map((m: any) => (
                  <Badge key={`${m.business_id}-${m.role}`} variant="outline">
                    {m.business_name} · {ROLE_LABEL[m.role] ?? m.role}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{shortDate(u.created_at)}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
