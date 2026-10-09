import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/app-mode";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { ErrorState } from "@/components/ui/states";
import type { DataColumn } from "@/components/ui/data-table";
import { AdminResourceTable, type FilterDef } from "./resource-table";
import type { ResolvedField } from "./record-form";
import { buildRows } from "./build-rows";
import { resourceConfig, type ResourceKey } from "./resources";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";

const hintKey: Record<string, string> = { password: "passwordHint", published: "publishedHint", tags: "tagsHint" };
const numeric = new Set(["amount", "topics", "tests", "questions", "levels", "subjects", "points", "order", "duration", "passMark"]);

/** Server component: authorises, loads rows through the services, hands plain data to the client table. */
export async function AdminResourcePage({ resource }: { resource: ResourceKey }) {
  const session = await requireSession(STAFF_ROLES);
  const [t, s] = await Promise.all([getTranslations("admin.resources"), getTranslations("states")]);
  const cfg = resourceConfig[resource];
  const title = t(`${resource}.title`);

  if (!can(session.user.role, cfg.permission)) {
    return (
      <>
        <PageHeader title={title} />
        <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />
      </>
    );
  }

  const built = await buildRows(resource);
  // Loose lookup: field/column/filter labels live under admin.resources.<resource>.*
  const label = t as unknown as (key: string) => string;
  const canEdit = !!cfg.editPermission && can(session.user.role, cfg.editPermission);

  const columns: DataColumn[] = cfg.columns.map((key, i) => ({
    key,
    header: label(`${resource}.columns.${key}`),
    align: numeric.has(key) ? "right" : "left",
    mobile: i === 0 ? "title" : "row",
  }));
  const fields: ResolvedField[] = cfg.fields.map((f) => ({
    ...f,
    label: label(`${resource}.fields.${f.name}`),
    hint: hintKey[f.name] ? label(`${resource}.fields.${hintKey[f.name]}`) : undefined,
    options: built.options[f.name],
  }));
  const filters: FilterDef[] = cfg.filters.map((name) => ({ name, label: label(`${resource}.filters.${name}`), options: built.filters[name] ?? [] }));

  return (
    <>
      <PageHeader title={title} description={!isDemoMode && (resource === "exams" || resource === "payments") ? t(`${resource}.descriptionLive`) : t(`${resource}.description`)} actions={<>{resource === "materials" ? <Button asChild variant="outline"><Link href="/admin/materials/analytics">{(await getTranslations("admin.materialStats"))("link")}</Link></Button> : null}{resource === "materials" && canEdit ? <Button asChild variant="outline"><Link href="/admin/materials/bulk"><UploadCloud aria-hidden />{(await getTranslations("admin.bulk"))("link")}</Link></Button> : null}<DemoBadge /></>} />
      <AdminResourceTable
        resource={resource}
        columns={columns}
        rows={built.rows}
        fields={fields}
        filters={filters}
        addLabel={cfg.canCreate ? label(`${resource}.add`) : null}
        tableCaption={title}
        canEdit={canEdit}
        labels={cfg.customArchiveLabels ? (Object.fromEntries((['archive', 'restore', 'confirmTitle', 'confirmText', 'archivedBadge', 'archivedDone', 'restoredDone'] as const).map((k) => [k, label(`${resource}.labels.${k}`)])) as never) : undefined}
      />
    </>
  );
}
