"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataColumn, type DataRow } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import type { UploadedFile } from "@/features/storage/upload-client";
import { validationText } from "@/lib/validators/messages";
import type { EditableResource } from "@/lib/validators/admin";
import { setArchivedAction } from "./actions";
import { RecordDialog } from "./record-dialog";
import type { ResolvedField } from "./record-form";

export interface ResourceRow extends DataRow {
  search: string;
  values: Record<string, unknown>;
  archived: boolean;
  /** filter name → value (matched against the selected filter option) */
  filter: Record<string, string>;
  file?: UploadedFile;
  /** short label used in aria-labels of the row actions */
  label: string;
}
export interface FilterDef { name: string; label: string; options: { value: string; label: string }[] }

interface Props {
  resource: string;
  columns: DataColumn[];
  rows: ResourceRow[];
  fields: ResolvedField[];
  filters: FilterDef[];
  addLabel: string | null;
  tableCaption: string;
  canEdit: boolean;
}

export function AdminResourceTable({ resource, columns, rows, fields, filters, addLabel, tableCaption, canEdit }: Props) {
  const t = useTranslations("admin.table");
  const c = useTranslations("common");
  const v = useTranslations("admin.validation");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ row: ResourceRow | null } | null>(null);
  const [archiving, setArchiving] = useState<ResourceRow | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "destructive"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (showArchived || !r.archived) &&
        (q === "" || r.search.includes(q)) &&
        filters.every((f) => !filterValues[f.name] || r.filter[f.name] === filterValues[f.name]),
    );
  }, [rows, query, showArchived, filters, filterValues]);

  const archive = (row: ResourceRow, next: boolean) =>
    start(async () => {
      const res = await setArchivedAction(resource, row.id, next);
      setArchiving(null);
      if (res.ok) {
        setNotice({ kind: "success", text: next ? t("archivedDone") : t("restoredDone") });
        router.refresh();
      } else {
        const msg = res.code === "FORBIDDEN" ? "forbidden" : (res.message ?? "generic");
        setNotice({ kind: "destructive", text: validationText(v as unknown as (k: string, p?: Record<string, string | number>) => string, msg) });
      }
    });

  const actions = canEdit
    ? (row: DataRow) => {
        const r = rows.find((x) => x.id === row.id);
        if (!r) return null;
        return r.archived ? (
          <Button variant="outline" size="sm" onClick={() => archive(r, false)} disabled={pending} aria-label={`${t("restore")}: ${r.label}`}>
            <RotateCcw aria-hidden />{t("restore")}
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="icon" aria-label={`${c("edit")}: ${r.label}`} onClick={() => setEditing({ row: r })}><Pencil className="size-4" aria-hidden /></Button>
            <Button variant="ghost" size="icon" aria-label={`${t("archive")}: ${r.label}`} onClick={() => setArchiving(r)}><Archive className="size-4 text-destructive" aria-hidden /></Button>
          </>
        );
      }
    : undefined;

  const tableRows: ResourceRow[] = visible.map((r) =>
    r.archived ? { ...r, cells: { ...r.cells, [columns[0]!.key]: (<span className="flex flex-wrap items-center gap-2">{r.cells[columns[0]!.key]}<Badge variant="outline">{t("archivedBadge")}</Badge></span>) } } : r,
  );
  const hasArchived = rows.some((r) => r.archived);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="admin-search" className="sr-only">{t("search")}</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="admin-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="pl-9" />
          </div>
          {filters.map((f) => (
            <div key={f.name} className="sm:w-44">
              <label htmlFor={`flt-${f.name}`} className="sr-only">{f.label}</label>
              <Select id={`flt-${f.name}`} value={filterValues[f.name] ?? ""} onChange={(e) => setFilterValues((p) => ({ ...p, [f.name]: e.target.value }))} aria-label={f.label}>
                <option value="">{f.label}: {t("filterAll")}</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          ))}
          {canEdit && hasArchived ? (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={showArchived} onCheckedChange={(x) => setShowArchived(x === true)} />
              {t("showArchived")}
            </label>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className="type-small text-muted-foreground" aria-live="polite">{t("rows", { count: visible.length })}</span>
          {canEdit && addLabel ? (
            <Button onClick={() => setEditing({ row: null })}><Plus aria-hidden />{addLabel}</Button>
          ) : null}
        </div>
      </div>

      {!canEdit ? <p className="type-caption text-muted-foreground">{t("readOnly")}</p> : null}
      <div aria-live="polite">{notice ? <Alert variant={notice.kind}>{notice.text}</Alert> : null}</div>

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? t("empty") : t("noMatch")}
          description={rows.length === 0 && canEdit && addLabel ? t("emptyText") : undefined}
          action={rows.length === 0 && canEdit && addLabel ? <Button onClick={() => setEditing({ row: null })}><Plus aria-hidden />{addLabel}</Button> : undefined}
        />
      ) : (
        <DataTable caption={tableCaption} columns={columns} rows={tableRows} rowActions={actions} actionsHeader={c("actions")} />
      )}

      {editing ? (
        <RecordDialog
          key={editing.row?.id ?? "new"}
          resource={resource as EditableResource}
          id={editing.row?.id ?? null}
          fields={fields}
          initial={editing.row?.values}
          initialFile={editing.row?.file}
          title={editing.row ? t("editTitle") : (addLabel ?? t("createTitle"))}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice({ kind: "success", text: t("saved") }); }}
        />
      ) : null}

      <Dialog open={!!archiving} onOpenChange={(o) => !o && !pending && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteText")}</DialogDescription>
          </DialogHeader>
          {archiving ? <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">{archiving.label}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)} disabled={pending}>{c("cancel")}</Button>
            <Button variant="destructive" loading={pending} onClick={() => archiving && archive(archiving, true)}><Archive aria-hidden />{t("archive")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
