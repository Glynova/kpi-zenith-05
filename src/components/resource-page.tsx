/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import type { IllustrationKind } from "@/components/empty-illustration";
import { ImageThumb, ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

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
  format?: "currency" | "number" | "date" | "badge" | "text" | "boolean" | "image";
};

export type FormCtx = {
  form: Row;
  setForm: (row: Row) => void;
  editing: Row | null;
};

export type Field = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "date" | "select" | "relation" | "boolean" | "image";
  options?: string[];
  relation?: { table: string; labelKey?: string };
  required?: boolean;
  default?: any;
  placeholder?: string;
  /** Replace the default input with a custom control. */
  render?: (ctx: FormCtx) => ReactNode;
  /** Hide the field entirely for the current form state. */
  hidden?: (ctx: FormCtx) => boolean;
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
  /** Extra buttons rendered at the end of each row. */
  rowActions?: (row: Row) => ReactNode;
  /** Extra buttons rendered in the page header. */
  toolbar?: ReactNode;
  /** Disable CSV import (enabled by default for writable tables). */
  enableImport?: boolean;
  /** Extra content rendered under the form fields. */
  formExtras?: (ctx: FormCtx) => ReactNode;
  /** Render formExtras directly after this field key instead of at the end. */
  formExtrasAfter?: string;
  /** Return an error message to block saving. */
  validate?: (ctx: FormCtx) => string | null;
  /** Runs after the record is saved; receives the record id. */
  afterSave?: (ctx: FormCtx & { id: string }) => Promise<void>;
  /** Called when the create/edit dialog opens. */
  onOpenForm?: (row: Row | null) => void;
  /** Split the form into a multi-step wizard. Field keys not listed fall into the last step. */
  steps?: { title: string; description?: string; fields: string[] }[];
  /** Illustration used on the empty state. */
  illustration?: IllustrationKind;
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
  rowActions,
  toolbar,
  enableImport = true,
  formExtras,
  formExtrasAfter,
  validate,
  afterSave,
  onOpenForm,
  steps,
  illustration = "generic",
}: Props) {
  // "Products" -> "Product", "Categories" -> "Category" for form headings.
  const singularTitle = title.endsWith("ies")
    ? `${title.slice(0, -3)}y`
    : /(sses|xes|zes|ches|shes)$/.test(title)
      ? title.slice(0, -2)
      : title.endsWith("s") && !title.endsWith("ss")
        ? title.slice(0, -1)
        : title;
  const { businessId, currency, canWrite } = useBusiness();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const [step, setStep] = useState(0);

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
        const { data } = await db.from(rel).select("*").eq("business_id", businessId).limit(500);
        out[rel] = data ?? [];
      }
      return out;
    },
  });

  const save = useMutation({
    mutationFn: async (values: Row) => {
      const payload: Row = { ...values, business_id: businessId };
      let id = editing?.id as string | undefined;
      if (editing) {
        const { error } = await db.from(table).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from(table).insert(payload).select("id").single();
        if (error) throw error;
        id = data?.id;
      }
      if (afterSave && id) await afterSave({ form, setForm, editing, id });
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
      searchKeys.some((k) =>
        String(row[k] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [data, search, searchKeys]);

  function openCreate() {
    const defaults: Row = {};
    fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.key] = f.default;
    });
    setForm(defaults);
    setEditing(null);
    setStep(0);
    onOpenForm?.(null);
    setOpen(true);
  }

  function openEdit(row: Row) {
    const values: Row = {};
    fields.forEach((f) => (values[f.key] = row[f.key] ?? ""));
    setForm(values);
    setEditing(row);
    setStep(0);
    onOpenForm?.(row);
    setOpen(true);
  }

  function submit() {
    const missing = fields.filter(
      (f) => f.required && f.type !== "boolean" && !String(form[f.key] ?? "").trim(),
    );
    if (missing.length) {
      toast.error(`${missing[0].label} is required`);
      return;
    }
    const error = validate?.({ form, setForm, editing });
    if (error) {
      toast.error(error);
      return;
    }
    const payload: Row = {};
    fields.forEach((f) => {
      const raw = form[f.key];
      if (f.type === "boolean") {
        payload[f.key] = raw === true || raw === "true";
      } else if (raw === "" || raw === undefined || raw === null) {
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
      .map((row) =>
        columns.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string): string[][] {
    const rowsOut: string[][] = [];
    let cell = "";
    let row: string[] = [];
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rowsOut.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rowsOut.push(row);
    }
    return rowsOut.filter((r) => r.some((c) => c.trim() !== ""));
  }

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error("The file has no data rows");
      const header = parsed[0].map((h) => h.trim().toLowerCase());
      const map = header.map((h) => {
        const field = fields.find((f) => f.key.toLowerCase() === h || f.label.toLowerCase() === h);
        return field ?? null;
      });
      if (!map.some(Boolean)) {
        throw new Error(
          `No matching columns. Expected headers like: ${fields.map((f) => f.label).join(", ")}`,
        );
      }
      const payload = parsed.slice(1).map((line) => {
        const record: Row = { business_id: businessId };
        map.forEach((field, i) => {
          if (!field) return;
          const raw = (line[i] ?? "").trim();
          if (raw === "") return;
          record[field.key] = field.type === "number" ? Number(raw) : raw;
        });
        fields.forEach((f) => {
          if (record[f.key] === undefined && f.default !== undefined) record[f.key] = f.default;
        });
        return record;
      });
      const { error } = await db.from(table).insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      toast.success(`Imported ${count} record${count === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["resource", table, businessId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });

  function renderCell(row: Row, col: Column) {
    const value = row[col.key];
    if (col.format === "boolean")
      return <Badge variant={value ? "default" : "secondary"}>{value ? "Yes" : "No"}</Badge>;
    if (col.format === "image") return <ImageThumb value={value} alt={String(row.name ?? "")} />;
    if (value === null || value === undefined || value === "")
      return <span className="text-muted-foreground">—</span>;
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

  const visibleFields = fields.filter((field) => !field.hidden?.({ form, setForm, editing }));

  const stepPlan = useMemo(() => {
    if (!steps?.length) return null;
    const listed = new Set(steps.flatMap((s) => s.fields));
    const rest = fields.filter((f) => !listed.has(f.key)).map((f) => f.key);
    return steps.map((s, i) => ({
      title: s.title,
      description: s.description,
      keys: i === steps.length - 1 ? [...s.fields, ...rest] : s.fields,
    }));
  }, [steps, fields]);

  const activeStep = stepPlan?.[Math.min(step, stepPlan.length - 1)] ?? null;
  const isLastStep = !stepPlan || step >= stepPlan.length - 1;

  function goNext() {
    const missing = visibleFields.filter(
      (f) =>
        f.required &&
        f.type !== "boolean" &&
        activeStep?.keys.includes(f.key) &&
        !String(form[f.key] ?? "").trim(),
    );
    if (missing.length) {
      toast.error(`${missing[0].label} is required`);
      return;
    }
    setStep((s) => s + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {toolbar}
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
            {editable && enableImport && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importCsv.mutate(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={importCsv.isPending}
                >
                  <Upload className="size-4" /> {importCsv.isPending ? "Importing..." : "Import"}
                </Button>
              </>
            )}
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
          illustration={illustration}
          description={`Create your first record to start tracking ${title.toLowerCase()}.`}
          action={editable ? <Button onClick={openCreate}>Add record</Button> : undefined}
        />
      ) : (
        <div className="surface-panel overflow-x-auto shadow-elevate-1">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                {(editable || rowActions) && (
                  <TableHead className="w-24 text-right">Actions</TableHead>
                )}
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
                  {(editable || rowActions) && (
                    <TableCell className="whitespace-nowrap text-right">
                      {rowActions?.(row)}
                      {editable && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteRow(row)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${singularTitle}` : `New ${singularTitle}`}
            </DialogTitle>
            <DialogDescription>
              {activeStep?.description ?? "Fill in the details below and save."}
            </DialogDescription>
          </DialogHeader>

          {steps && steps.length > 1 && (
            <ol className="flex flex-wrap items-center gap-2">
              {steps.map((s, i) => (
                <li key={s.title} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                      i === step
                        ? "border-primary bg-primary text-primary-foreground shadow-elevate-1"
                        : i < step
                          ? "border-border bg-secondary text-secondary-foreground"
                          : "border-dashed border-border text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium tabular-nums">{i + 1}</span>
                    <span className="hidden sm:inline">{s.title}</span>
                  </button>
                  {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
                </li>
              ))}
            </ol>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {visibleFields
              .filter((field) => !activeStep || activeStep.keys.includes(field.key))
              .flatMap((field) => [
                <div
                  key={field.key}
                  className={
                    field.type === "textarea" || field.type === "image"
                      ? "sm:col-span-2"
                      : "min-w-0"
                  }
                >
                  <Label htmlFor={field.key} className="mb-1.5 block text-xs">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {field.render ? (
                    field.render({ form, setForm, editing })
                  ) : field.type === "image" ? (
                    <ImageUpload
                      id={field.key}
                      businessId={businessId}
                      value={form[field.key] ?? null}
                      onChange={(v) => setForm({ ...form, [field.key]: v })}
                    />
                  ) : field.type === "boolean" ? (
                    <div className="flex h-9 items-center">
                      <Switch
                        id={field.key}
                        checked={form[field.key] === true || form[field.key] === "true"}
                        onCheckedChange={(v: boolean) => setForm({ ...form, [field.key]: v })}
                      />
                    </div>
                  ) : field.type === "textarea" ? (
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
                      type={
                        field.type === "number" ? "number" : field.type === "date" ? "date" : "text"
                      }
                      step={field.type === "number" ? "any" : undefined}
                      placeholder={field.placeholder}
                      value={form[field.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    />
                  )}
                </div>,
                ...(formExtras && field.key === formExtrasAfter
                  ? [
                      <div key={`${field.key}-extras`} className="sm:col-span-2">
                        {formExtras({ form, setForm, editing })}
                      </div>,
                    ]
                  : []),
              ])}
            {formExtras && !formExtrasAfter && (
              <div className="sm:col-span-2">{formExtras({ form, setForm, editing })}</div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex items-center gap-2">
              {stepPlan && step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              {stepPlan && (
                <span className="text-xs text-muted-foreground">
                  Step {Math.min(step + 1, stepPlan.length)} of {stepPlan.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {!isLastStep ? (
                <Button onClick={goNext}>Continue</Button>
              ) : (
                <Button onClick={submit} disabled={save.isPending}>
                  {save.isPending ? "Saving..." : "Save"}
                </Button>
              )}
            </div>
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
