import type { Metadata } from "next";
import Link from "next/link";
import { Clock, FileText, NotebookPen, Search } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { requireSession } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notesPage"))("title") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** All notes of the signed-in student (their own only — the service is scoped by the session's user id). */
export default async function NotesPage({ searchParams }: { searchParams: Search }) {
  const [session, sp, t, n, f] = await Promise.all([requireSession(), searchParams, getTranslations("notesPage"), getTranslations("material.notes"), getFormatter()]);
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const q = raw?.trim().slice(0, 100) || undefined;
  const notes = await services.notes.listForUser(session.user.id, q);
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <form method="get" role="search" aria-label={t("search")} className="flex max-w-xl gap-2">
        <label htmlFor="notes-q" className="sr-only">{t("search")}</label>
        <Input id="notes-q" name="q" defaultValue={q ?? ""} placeholder={t("searchPlaceholder")} maxLength={100} />
        <Button type="submit"><Search aria-hidden />{t("searchButton")}</Button>
      </form>
      {notes.length === 0 ? (
        <EmptyState icon={<NotebookPen aria-hidden />} title={q ? t("noResults") : t("emptyTitle")} description={q ? undefined : t("emptyText")}
          action={<Button asChild variant="outline"><Link href={routes.courses}>{t("toCourses")}</Link></Button>} />
      ) : (
        <ul className="space-y-3" data-notes-list>
          {notes.map((x) => (
            <li key={x.id} className="space-y-2 rounded-xl border border-border bg-card p-4" data-note>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {x.href ? <Link href={x.href} className="font-semibold text-primary hover:underline">{x.materialTitle}</Link> : <span className="font-semibold">{x.materialTitle}</span>}
                <span className="type-caption text-muted-foreground">{f.dateTime(new Date(x.updatedAt), { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              {x.videoSeconds !== undefined ? <p className="type-caption inline-flex items-center gap-1 font-semibold"><Clock className="size-3.5" aria-hidden />{stamp(x.videoSeconds)}</p> : null}
              {x.pdfPage !== undefined ? <p className="type-caption inline-flex items-center gap-1 font-semibold"><FileText className="size-3.5" aria-hidden />{n("page", { page: x.pdfPage })}</p> : null}
              <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{x.body}</p>
              {!x.href ? <p className="type-caption text-muted-foreground">{t("unavailable")}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
