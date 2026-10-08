import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/states";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SubjectCard } from "@/features/courses/subject-card";
import { ProgressOverview } from "@/features/dashboard/progress-overview";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { formatDateTime } from "@/lib/format";
import { requireSession } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("progressPage"))("title") };
}

export default async function ProgressPage() {
  const session = await requireSession();
  const [t, locale, results, overview, subjects] = await Promise.all([
    getTranslations("progressPage"),
    getLocale(),
    services.tests.listResults(session.user.id, 20),
    services.dashboard.getOverview(session.user.id),
    services.subjects.list(),
  ]);
  const withProgress = await Promise.all(subjects.map(async (s) => ({ s, p: await services.progress.getSubjectProgress(session.user.id, s.slug) })));
  const started = withProgress.filter((x) => x.p.percent > 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <ProgressOverview data={overview.progressBreakdown} overall={overview.stats.overallProgress} />
        <section aria-labelledby="by-subject" className="space-y-3 lg:col-span-2">
          <h2 id="by-subject" className="type-h3">{t("bySubject")}</h2>
          {started.length === 0 ? (
            <EmptyState title={t("empty")} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {started.map(({ s, p }) => (
                <SubjectCard key={s.slug} subject={s} percent={p.percent} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="test-results" className="space-y-3">
        <h2 id="test-results" className="type-h3">{t("results")}</h2>
        {results.length === 0 ? (
          <EmptyState title={t("noResults")} />
        ) : (
          <ul className="grid gap-2">
            {results.map((r) => (
              <li key={r.attemptId}>
                <Link href={routes.testResult(r.testId, r.attemptId)} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.testTitle}</span>
                    <span className="type-caption block text-muted-foreground">{r.subjectName} · {formatDateTime(r.submittedAt, locale)}</span>
                  </span>
                  <Badge variant={r.passed ? "success" : "warning"}>{r.scorePercent}%</Badge>
                  <span className="type-small font-semibold text-primary">{t("view")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
