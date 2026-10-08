"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn, type DataRow } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectField, TextField, TextareaField } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import type { FieldDef } from "./resources";

export interface ResourceRow extends DataRow {
  /** lower-cased text used for client-side search */
  search: string;
  /** raw values to prefill the edit form */
  values: Record<string, string>;
}
export interface ResolvedField extends FieldDef {
  label: string;
  options?: { value: string; label: string }[];
}

type Values = Record<string, string>;

function buildSchema(fields: ResolvedField[], msg: { required: string; email: string; min: (n: number) => string; number: (a: number, b: number) => string }) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny;
    if (f.kind === "email") s = z.string().trim().min(1, msg.required).email(msg.email).max(254, msg.email);
    else if (f.kind === "number")
      s = z
        .string()
        .trim()
        .min(1, msg.required)
        .refine((v) => {
          const n = Number(v);
          return Number.isFinite(n) && n >= (f.min ?? 0) && n <= (f.max ?? Number.MAX_SAFE_INTEGER);
        }, msg.number(f.min ?? 0, f.max ?? 999999));
    else if (f.kind === "select") s = z.string().min(1, msg.required);
    else s = z.string().trim().min(1, msg.required).min(f.min ?? 1, msg.min(f.min ?? 1)).max(f.max ?? 500, msg.min(f.min ?? 1));
    shape[f.name] = s;
  }
  return z.object(shape);
}

interface Props {
  columns: DataColumn[];
  rows: ResourceRow[];
  fields: ResolvedField[];
  addLabel: string;
  tableCaption: string;
  canEdit: boolean;
}

export function AdminResourceTable({ columns, rows, fields, addLabel, tableCaption, canEdit }: Props) {
  const t = useTranslations("admin.table");
  const c = useTranslations("common");
  const v = useTranslations("admin.validation");
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ row: ResourceRow | null } | null>(null);
  const [deleting, setDeleting] = useState<ResourceRow | null>(null);
  const [notice, setNotice] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !archived.includes(r.id) && (q === "" || r.search.includes(q)));
  }, [rows, archived, query]);

  const actions = canEdit
    ? (row: DataRow) => {
        const r = rows.find((x) => x.id === row.id);
        if (!r) return null;
        return (
          <>
            <Button variant="ghost" size="icon" aria-label={`${c("edit")}: ${r.search.split(" ")[0] ?? ""}`} onClick={() => setEditing({ row: r })}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`${c("delete")}: ${r.search.split(" ")[0] ?? ""}`} onClick={() => setDeleting(r)}>
              <Trash2 className="size-4 text-destructive" aria-hidden />
            </Button>
          </>
        );
      }
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="admin-search" className="sr-only">{t("search")}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="admin-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="pl-9" />
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="type-small text-muted-foreground" aria-live="polite">{t("rows", { count: visible.length })}</span>
          {canEdit ? (
            <Button onClick={() => setEditing({ row: null })}>
              <Plus aria-hidden />
              {addLabel}
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? <Alert variant="info">{t("demoSave")}</Alert> : null}

      {rows.length === 0 || visible.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? t("empty") : t("noMatch")}
          description={rows.length === 0 ? t("emptyText") : undefined}
          action={rows.length === 0 && canEdit ? <Button onClick={() => setEditing({ row: null })}><Plus aria-hidden />{addLabel}</Button> : undefined}
        />
      ) : (
        <DataTable caption={tableCaption} columns={columns} rows={visible} rowActions={actions} actionsHeader={c("actions")} />
      )}

      {editing ? (
        <RecordDialog
          key={editing.row?.id ?? "new"}
          fields={fields}
          initial={editing.row?.values}
          title={editing.row ? c("edit") : addLabel}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice(true);
          }}
          msg={{ required: v("required"), email: v("emailInvalid"), min: (n) => v("min", { min: n }), number: (a, b) => v("number", { min: a, max: b }) }}
        />
      ) : null}

      <ConfirmDelete
        row={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) setArchived((a) => [...a, deleting.id]);
          setDeleting(null);
          setNotice(true);
        }}
      />
    </div>
  );
}

function RecordDialog({
  fields,
  initial,
  title,
  onClose,
  onSaved,
  msg,
}: {
  fields: ResolvedField[];
  initial?: Values;
  title: string;
  onClose: () => void;
  onSaved: () => void;
  msg: Parameters<typeof buildSchema>[1];
}) {
  const c = useTranslations("common");
  const [pending, start] = useTransition();
  const schema = useMemo(() => buildSchema(fields, msg), [fields, msg]);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] ?? ""])),
  });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit(() =>
    start(async () => {
      // Backend block: call the matching service through a validated server action.
      await new Promise((r) => setTimeout(r, 250));
      onSaved();
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {fields.map((f) => {
            const common = { id: `f-${f.name}`, label: f.label, required: f.required, registration: form.register(f.name), error: errors[f.name]?.message as string | undefined };
            if (f.kind === "textarea") return <TextareaField key={f.name} {...common} rows={4} />;
            if (f.kind === "select") return <SelectField key={f.name} {...common} options={f.options ?? []} placeholder="—" />;
            return <TextField key={f.name} {...common} type={f.kind === "number" ? "number" : f.kind === "email" ? "email" : "text"} inputMode={f.kind === "number" ? "numeric" : undefined} />;
          })}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{c("cancel")}</Button>
            <Button type="submit" loading={pending}>{c("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDelete({ row, onCancel, onConfirm }: { row: ResourceRow | null; onCancel: () => void; onConfirm: () => void }) {
  const t = useTranslations("admin.table");
  const c = useTranslations("common");
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
          <DialogDescription>{t("confirmDeleteText")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{c("cancel")}</Button>
          <Button variant="destructive" onClick={onConfirm}><Trash2 aria-hidden />{c("delete")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
