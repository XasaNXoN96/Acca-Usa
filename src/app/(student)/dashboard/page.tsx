import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { Card } from "@/components/ui/card";
import { SubjectProgress } from "@/features/dashboard/subject-progress";
import { MyLearningLinks } from "@/features/dashboard/my-learning-links";
import { StatsRow } from "@/features/dashboard/stats-row";
import { MyCourses } from "@/features/dashboard/my-courses";
import { ContinueLearning } from "@/features/dashboard/continue-learning";
import { RecentActivity } from "@/features/dashboard/recent-activity";
import { ProgressOverview } from "@/features/dashboard/progress-overview";
import { RankingPreview } from "@/features/dashboard/ranking-preview";
import { TestsPreview } from "@/features/dashboard/tests-preview";
import { CertificatesPreview } from "@/features/dashboard/certificates-preview";
import { services } from "@/services";
import { requireSession } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("dashboard") };
}

export default async function DashboardPage() {
  const session = await requireSession();
  const [t, data, platforms] = await Promise.all([
    getTranslations("dashboard"),
    services.dashboard.getOverview(session.user.id),
    services.platforms.list(),
  ]);

  return (
    <>
      <PageHeader
        title={t("welcome", { name: data.user.name })}
        description={t("subtitle")}
        actions={<DemoBadge />}
      />
      <StatsRow stats={data.stats} />
      <MyLearningLinks availableTests={data.availableTests.length} results={data.recentResults.length} />
      {data.stats.enrolledCourses === 0 ? (
        <Card className="space-y-1 p-5">
          <h2 className="type-h3">{t("noEnrollmentsTitle")}</h2>
          <p className="type-small text-muted-foreground">{t("noEnrollmentsText")}</p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Mobile priority: resume learning first, then course list. */}
          <div className="flex flex-col gap-6">
            <div className="order-2 md:order-1">
              <MyCourses enrollments={data.enrollments} platforms={platforms} />
            </div>
            <div className="order-1 md:order-2">
              <ContinueLearning items={data.continueLearning} last={data.lastMaterial} />
            </div>
          </div>
          <RecentActivity items={data.recentActivity} />
          <TestsPreview results={data.recentResults} available={data.availableTests} />
        </div>
        <div className="space-y-6">
          <ProgressOverview data={data.progressBreakdown} overall={data.stats.overallProgress} />
          <SubjectProgress items={data.subjectProgress} />
          <RankingPreview entries={data.ranking} />
          <CertificatesPreview items={data.certificates} />
        </div>
      </div>
    </>
  );
}
