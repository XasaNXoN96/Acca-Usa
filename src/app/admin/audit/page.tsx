import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";
import { services } from "@/services";
import type { AuditOutcome } from "@/lib/audit-chain";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.audit"))("title") };
}

const PAGE_SIZE = 50;
const OUTCOMES: AuditOutcome[] = ["success", "denied", "failed"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 80) || undefined;

/** READ-ONLY. There is no form, action or route anywhere that edits or removes an audit event. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, s, session, sp] = await Promise.all([getTranslations("admin.audit"), getTranslations("states"), requireSession(STAFF_ROLES), searchParams]);
  if (!can(session.user.role, "view_audit")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;

  const action = one(sp.action);
  const actor = one(sp.actor);
  const outcome = OUTCOMES.find((o) => o === one(sp.outcome));
  const page = Math.max(Number.parseInt(one(sp.page) ?? "1", 10) || 1, 1);
  const [{ items, total }, integrity] = await Promise.all([
    services.audit.list({ action, actor, outcome, page, pageSize: PAGE_SIZE }),
    services.audit.verify(5000),
  ]);
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const href = (p: number) => {
    const q = new URLSearchParams();
    if (action) q.set("action", action);
    if (actor) q.set("actor", actor);
    if (outcome) q.set("outcome", outcome);
    if (p > 1) q.set("page", String(p));
    return `/admin/audit${q.size ? `?${q}` : ""}`;
  };
  const when = (iso: string) => iso.replace("T", " ").slice(0, 19) + " UTC";

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      {integrity.ok ? (
        <Alert variant="success"><span data-audit-integrity="ok">{t("integrityOk", { count: integrity.checked })}</span></Alert>
      ) : (
        <Alert variant="destructive"><span data-audit-integrity="broken">{t("integrityBroken", { id: integrity.badId })}</span></Alert>
      )}
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label={t("filters")}>
        <label className="type-small space-y-1"><span className="block font-semibold">{t("filterAction")}</span>
          <input name="action" defaultValue={action} placeholder="materials.update" className="h-10 rounded-lg border border-input bg-background px-3" maxLength={80} /></label>
        <label className="type-small space-y-1"><span className="block font-semibold">{t("filterActor")}</span>
          <input name="actor" defaultValue={actor} className="h-10 rounded-lg border border-input bg-background px-3" maxLength={80} /></label>
        <label className="type-small space-y-1"><span className="block font-semibold">{t("filterOutcome")}</span>
          <select name="outcome" defaultValue={outcome ?? ""} className="h-10 rounded-lg border border-input bg-background px-3">
            <option value="">{t("any")}</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{t(`outcome.${o}`)}</option>)}
          </select></label>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">{t("apply")}</button>
      </form>
      {items.length === 0 ? (
        <p className="type-body text-muted-foreground" data-audit-empty>{t("empty")}</p>
      ) : (
        <Table label={t("title")} data-audit-table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col.time")}</TableHead><TableHead>{t("col.actor")}</TableHead><TableHead>{t("col.action")}</TableHead>
              <TableHead>{t("col.target")}</TableHead><TableHead>{t("col.outcome")}</TableHead><TableHead>{t("col.details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id} data-audit-action={e.action}>
                <TableCell className="whitespace-nowrap">{when(e.at)}</TableCell>
                <TableCell>{e.actorEmail ?? (e.actorType === "system" ? `${t("system")}${e.actorId ? ` (${e.actorId})` : ""}` : e.actorType === "cli" ? t("operator") : e.actorId ?? "—")}</TableCell>
                <TableCell><code className="type-small">{e.action}</code></TableCell>
                <TableCell>{e.targetType ? `${e.targetType}${e.targetId ? `:${e.targetId}` : ""}` : "—"}</TableCell>
                <TableCell><Badge variant={e.outcome === "success" ? "success" : e.outcome === "denied" ? "warning" : "destructive"}>{t(`outcome.${e.outcome}`)}</Badge></TableCell>
                <TableCell className="max-w-xs break-words type-caption text-muted-foreground">{[e.metaJson, e.ip].filter(Boolean).join(" · ") || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <nav aria-label={t("pagination")} className="type-small flex items-center gap-3">
        {page > 1 ? <Link href={href(page - 1)} className="font-semibold text-primary hover:underline">{t("prev")}</Link> : null}
        <span>{t("pageOf", { page, pages, total })}</span>
        {page < pages ? <Link href={href(page + 1)} className="font-semibold text-primary hover:underline">{t("next")}</Link> : null}
      </nav>
    </div>
  );
}
