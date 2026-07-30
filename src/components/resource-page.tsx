/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Column = {
  key: string;
  label: string;
  format?: "currency" | "number" | "date" | "badge" | "text";
};

export type Field = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "date" | "select" | "relation";
  options?: string[];
  relation?: { table: string; labelKey?: string };
  required?: boolean;
  default?: any;
  placeholder?: string;
};

type Props = {
  table: string;
  title: string;
  description: string;
  columns: Column[];
  fields: Field[];
  searchKeys?: string[];
  orderBy?: string;
  readOnly?: boolean;
};

export function ResourcePage({
  table,
  title,
  description,
  columns,
  fields,
  searchKeys = ["name"],
  orderBy = "created_at",
  readOnly = false,
}: Props) {
  const { businessId, currency, canWrite } = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);

  const editable = canWrite && !readOnly;

  const { data, isLoading } = useQuery({
    queryKey: ["resource", table, businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await db
        .from(table)
        .select("*")
        .eq("business_id", businessId)
        .order(orderBy, { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const relationTables = useMemo(
    () => Array.from(new Set(fields.filter((f) => f.relation).map((f) => f.relation!.table))),
    [fields],
  );

  const { data: relations } = useQuery({
    queryKey: ["relations", relationTables, businessId],
    enabled: !!businessId && relationTables.length > 0,
    queryFn: async () => {
      const out: Record<string, Row[]> = {};
      for (const rel of relationTables) {
        const { data } = await db
          .from(rel)
          .select("*")
          .eq("business_id", businessId)
          .limit(500);
        out[rel] = data ?? [];
      }
      return out;
    },
  });

  const save = useMutation({
    mutationFn: async (values: Row) => {
      const payload: Row = { ...values, business_id: businessId };
      if (editing) {
        const { error } = await db.from(table).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Record updated" : "Record created");
      queryClient.invalidateQueries({ queryKey: ["resource", table, businessId] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Something went wrong"),
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await db.from(table).delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["resource", table, businessId] });
      setDeleteRow(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(q)),
    );
  }, [data, search, searchKeys]);

  function openCreate() {
    const defaults: Row = {};
    fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setForm(defaults);
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Row) {
    const values: Row = {};
    fields.forEach((f) => (values[f.key] = row[f.key] ?? ""));
    setForm(values);
    setEditing(row);
    setOpen(true);
  }

  function submit() {
    const missing = fields.filter((f) => f.required && !String(form[f.key] ?? "").trim());
    if (missing.length) {
      toast.error(`${missing[0].label} is required`);
      return;
    }
    const payload: Row = {};
    fields.forEach((f) => {
      const raw = form[f.key];
      if (raw === "" || raw === undefined || raw === null) {
        payload[f.key] = f.type === "number" ? 0 : null;
      } else {
        payload[f.key] = f.type === "number" ? Number(raw) : raw;
      }
    });
    save.mutate(payload);
  }

  function exportCsv() {
    const header = columns.map((c) => c.label).join(",");
    const body = rows
      .map((row) => columns.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderCell(row: Row, col: Column) {
    const value = row[col.key];
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
    switch (col.format) {
      case "currency":
        return formatCurrency(Number(value), currency);
      case "number":
        return formatNumber(Number(value), 2);
      case "date":
        return formatDate(value);
      case "badge":
        return <Badge variant="secondary">{titleCase(String(value))}</Badge>;
      default:
        return String(value);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
            {editable && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> New
              </Button>
            )}
          </>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search records..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={`Create your first record to start tracking ${title.toLowerCase()}.`}
          action={editable ? <Button onClick={openCreate}>Add record</Button> : undefined}
        />
      ) : (
        <div className="surface-panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                {editable && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className="whitespace-nowrap">
                      {renderCell(row, c)}
                    </TableCell>
                  ))}
                  {editable && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteRow(row)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title}` : `New ${title}`}</DialogTitle>
            <DialogDescription>Fill in the details below and save.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={field.key}
                className={field.type === "textarea" ? "sm:col-span-2" : "min-w-0"}
              >
                <Label htmlFor={field.key} className="mb-1.5 block text-xs">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    id={field.key}
                    value={form[field.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                ) : field.type === "select" ? (
                  <Select
                    value={form[field.key] ? String(form[field.key]) : undefined}
                    onValueChange={(v) => setForm({ ...form, [field.key]: v })}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>
                          {titleCase(o)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "relation" ? (
                  <Select
                    value={form[field.key] ? String(form[field.key]) : undefined}
                    onValueChange={(v) => setForm({ ...form, [field.key]: v })}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(relations?.[field.relation!.table] ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o[field.relation!.labelKey ?? "name"] ?? o.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    step={field.type === "number" ? "any" : undefined}
                    placeholder={field.placeholder}
                    value={form[field.key] ?? ""}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone and will permanently remove the record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRow && remove.mutate(deleteRow)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
