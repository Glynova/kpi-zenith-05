/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PageHeader } from "@/components/page-header";
import { DataCard, StatusBadge, TableCell, TableRow } from "@/components/portal-table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminBusinesses } from "@/lib/platform-admin.functions";
import { peso, shortDate } from "@/lib/partner-format";

export const Route = createFileRoute("/_authenticated/admin/businesses")({
  head: () => ({
    meta: [
      { title: "Workspaces — Daraven ERP" },
      {
        name: "description",
        content: "Every workspace on the platform with plan, status and owner.",
      },
      { property: "og:title", content: "Workspaces — Daraven ERP" },
      {
        property: "og:description",
        content: "Every workspace on the platform with plan, status and owner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminBusinesses,
});

function AdminBusinesses() {
  const fetchBusinesses = useServerFn(adminBusinesses);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-businesses"],
    queryFn: () => fetchBusinesses(),
  });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = (data?.businesses ?? []) as any[];
    const term = q.trim().toLowerCase();
    return term
      ? all.filter((b) =>
          String(b.name ?? "")
            .toLowerCase()
            .includes(term),
        )
      : all;
  }, [data, q]);

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Businesses" description="Every tenant workspace on the platform." />
      <DataCard
        title={`${rows.length} businesses`}
        actions={
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search businesses…"
            className="w-56"
          />
        }
        columns={["Business", "Plan", "Status", "Members", "Renews", "Created"]}
        rows={rows}
        empty={{ title: "No businesses found" }}
        renderRow={(b: any) => (
          <TableRow key={b.id}>
            <TableCell className="font-medium">{b.name}</TableCell>
            <TableCell>
              {b.plan}{" "}
              {b.price > 0 && <span className="text-muted-foreground">· {peso(b.price)}</span>}
            </TableCell>
            <TableCell>
              <StatusBadge status={b.status} />
            </TableCell>
            <TableCell className="tabular-nums">{b.members}</TableCell>
            <TableCell>{shortDate(b.current_period_end ?? b.trial_ends_at)}</TableCell>
            <TableCell className="text-muted-foreground">{shortDate(b.created_at)}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}
