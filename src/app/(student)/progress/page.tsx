import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EmptyState } from "@/components/ui/states";
import { SubjectCard } from "@/features/courses/subject-card";
import { ProgressOverview } from "@/features/dashboard/progress-overview";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("progressPage"))("title") };
}

export default async function ProgressPage() {
  const session = await services.auth.getSession("STUDENT");
  const [t, overview, subjects] = await Promise.all([
    getTranslations("progressPage"),
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
    </>
  );
}
