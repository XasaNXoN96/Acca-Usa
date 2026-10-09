import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Dumbbell, XCircle } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Select } from "@/components/ui/input";
import { requireSession } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("mistakes"))("title") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Wrong / skipped answers from the learner's REAL submitted attempts, with the correct answer and the explanation when one exists. */
export default async function MistakesPage({ searchParams }: { searchParams: Search }) {
  const [session, sp, t, f] = await Promise.all([requireSession(), searchParams, getTranslations("mistakes"), getFormatter()]);
  const all = await services.mistakes.list(session.user.id);
  const subjects = [...new Map(all.map((m) => [m.subjectSlug, m.subjectName])).entries()];
  const subject = one(sp.subject);
  const subjectSlug = subject && subjects.some(([slug]) => slug === subject) ? subject : undefined;
  const showAll = one(sp.show) === "all";
  const scoped = all.filter((m) => !subjectSlug || m.subjectSlug === subjectSlug);
  const items = scoped.filter((m) => showAll || !m.resolved);
  const open = scoped.filter((m) => !m.resolved).length;
  const practiceHref = `${routes.mistakesPractice}${subjectSlug ? `?subject=${encodeURIComponent(subjectSlug)}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")}
        actions={open > 0 ? <Button asChild><Link href={practiceHref}><Dumbbell aria-hidden />{t("practiceButton", { count: Math.min(open, 10) })}</Link></Button> : undefined} />
      <form method="get" className="flex flex-wrap items-end gap-3" role="search" aria-label={t("filters")}>
        <div className="space-y-1.5">
          <label htmlFor="m-subject" className="type-caption font-semibold">{t("subject")}</label>
          <Select id="m-subject" name="subject" defaultValue={subjectSlug ?? ""}>
            <option value="">{t("allSubjects")}</option>
            {subjects.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="m-show" className="type-caption font-semibold">{t("show")}</label>
          <Select id="m-show" name="show" defaultValue={showAll ? "all" : "open"}>
            <option value="open">{t("onlyOpen")}</option>
            <option value="all">{t("everything")}</option>
          </Select>
        </div>
        <Button type="submit" variant="outline">{t("apply")}</Button>
      </form>

      {items.length === 0 ? (
        <EmptyState title={all.length === 0 ? t("emptyTitle") : t("nothingOpenTitle")} description={all.length === 0 ? t("emptyText") : t("nothingOpenText")}
          action={<Button asChild variant="outline"><Link href={routes.courses}>{t("toCourses")}</Link></Button>} />
      ) : (
        <ol className="space-y-4" data-mistakes-list>
          {items.map((m) => (
            <li key={m.questionId} className="space-y-3 rounded-xl border border-border bg-card p-4" data-mistake data-resolved={m.resolved}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-caption text-muted-foreground">{m.subjectName} · {m.testTitle} · {f.dateTime(new Date(m.answeredAt), { dateStyle: "medium" })}</p>
                <span className="flex items-center gap-2">
                  {m.wrongCount > 1 ? <Badge variant="warning">{t("wrongTimes", { count: m.wrongCount })}</Badge> : null}
                  <Badge variant={m.resolved ? "success" : "destructive"}>{m.resolved ? t("resolved") : t("needsPractice")}</Badge>
                </span>
              </div>
              <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{m.text}</h2>
              <ul className="space-y-1.5 text-sm">
                {m.options.map((o) => {
                  const correct = o.id === m.correctOptionId;
                  const chosen = o.id === m.selectedOptionId;
                  return (
                    <li key={o.id} className={`flex items-start gap-2 rounded-lg border p-2 ${correct ? "border-success/50 bg-success-soft" : chosen ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
                      {correct ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : chosen ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
                      <span className="min-w-0 [overflow-wrap:anywhere]">{o.text}
                        {correct ? <span className="ml-2 font-semibold text-success">{t("correctAnswerTag")}</span> : null}
                        {chosen && !correct ? <span className="ml-2 font-semibold text-destructive">{t("yourAnswerTag")}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {m.selectedOptionId === null ? <p className="type-caption text-muted-foreground">{t("skipped")}</p> : null}
              {m.explanation ? <p className="rounded-lg bg-muted/60 p-3 text-sm" data-explanation><span className="font-semibold">{t("explanation")}: </span>{m.explanation}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
