import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { STATUS_TONE } from "@/lib/affiliate";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "—";
  return (
    <Badge variant={STATUS_TONE[value] ?? "outline"} className="capitalize">
      {value.replace(/_/g, " ")}
    </Badge>
  );
}

/** Card-wrapped responsive table with a built-in empty state. */
export function DataCard<T>({
  title,
  description,
  actions,
  columns,
  rows,
  renderRow,
  empty,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  columns: string[];
  rows: T[];
  renderRow: (row: T, index: number) => ReactNode;
  empty: { title: string; description?: string };
}) {
  return (
    <Card className="shadow-elevate-1">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {rows.length === 0 ? (
          <div className="px-6 pb-6 sm:px-0">
            <EmptyState title={empty.title} description={empty.description} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>{rows.map(renderRow)}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { TableCell, TableRow };
