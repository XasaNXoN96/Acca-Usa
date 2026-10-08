import type { Metadata } from "next";
import { Activity, Award, BookOpen, CheckCircle2, ClipboardCheck, CreditCard, FileText, GraduationCap, Library, Percent, Target, UserPlus, Users, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { ActivityChart, PassFailCard, SubjectProgressCard, TestPerformanceCard } from "@/features/admin/stats/stats-charts";
import { StatsFilters, rangePresets } from "@/features/admin/stats/stats-filters";
import { services } from "@/services";
import { can } from "@/lib/permissions";
import { isPlatformSlug } from "@/lib/platform-theme";
import { formatMoney } from "@/lib/format";
import { isDemoMode } from "@/lib/app-mode";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import type { StatsFilter } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.statistics"))("title") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Query → validated filter. Anything unexpected falls back to the default (last 30 days, everything). */
function parseFilter(sp: Record<string, string | string[] | undefined>, platforms: string[], subjects: string[]): { filter: StatsFilter; preset: string } {
  const today = new Date();
  const platform = one(sp.platform);
  const subject = one(sp.subject);
  let preset = one(sp.range) ?? "30";
  let from = one(sp.from);
  let to = one(sp.to);
  if (preset !== "custom" || !from || !ISO.test(from) || !to || !ISO.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) {
    if (!(rangePresets as readonly string[]).includes(preset)) preset = "30";
    const days = Number(preset);
    to = iso(today);
    from = iso(new Date(today.getTime() - (days - 1) * 86_400_000));
    if (preset === "custom") preset = "30";
  }
  return {
    preset,
    filter: {
      platform: platform && isPlatformSlug(platform) && platforms.includes(platform) ? platform : undefined,
      subjectSlug: subject && subjects.includes(subject) ? subject : undefined,
      from: from!,
      to: to!,
    },
  };
}

export default async function StatisticsPage({ searchParams }: { searchParams: Search }) {
  const [t, s, locale, session, sp, platforms, subjects] = await Promise.all([
    getTranslations("admin.statistics"),
    getTranslations("states"),
    getLocale(),
    requireSession(STAFF_ROLES),
    searchParams,
    services.platforms.list(),
    services.subjects.list(),
  ]);
  if (!can(session.user.role, "view_statistics")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;

  const { filter, preset } = parseFilter(sp, platforms.map((p) => p.slug), subjects.map((x) => x.slug));
  const stats = await services.stats.getAdminStats(filter);
  const c = stats.totals;
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  return (
    <>
      <PageHeader title={t("title")} description={isDemoMode ? t("description") : t("descriptionLive")} actions={<DemoBadge />} />
      <StatsFilters
        filter={filter}
        preset={preset}
        platforms={platforms.map((p) => ({ value: p.slug, label: p.name }))}
        subjects={subjects.map((x) => ({ value: x.slug, label: `${x.code} — ${x.name}`, platform: x.platform }))}
      />
      <p className="type-caption text-muted-foreground" data-stats-range>{t("period", { from: filter.from, to: filter.to })}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-stats-cards>
        <StatCard tone="primary" icon={<Users aria-hidden />} value={c.students} label={t("cards.students")} />
        <StatCard tone="fia" icon={<Activity aria-hidden />} value={c.activeStudents} label={t("cards.activeStudents")} />
        <StatCard tone="azure" icon={<Library aria-hidden />} value={c.subjects} label={t("cards.subjects")} />
        <StatCard tone="navy" icon={<GraduationCap aria-hidden />} value={c.topics} label={t("cards.topics")} />
        <StatCard tone="warning" icon={<FileText aria-hidden />} value={c.materials} label={t("cards.materials")} />
        <StatCard tone="primary" icon={<ClipboardCheck aria-hidden />} value={c.tests} label={t("cards.tests")} />
        <StatCard tone="azure" icon={<BookOpen aria-hidden />} value={c.attempts} label={t("cards.attempts")} />
        <StatCard tone="fia" icon={<Percent aria-hidden />} value={pct(c.passRate)} label={t("cards.passRate")} />
        <StatCard tone="warning" icon={<Target aria-hidden />} value={pct(c.avgScore)} label={t("cards.avgScore")} />
        <StatCard tone="navy" icon={<CheckCircle2 aria-hidden />} value={c.completedMaterials} label={t("cards.completedMaterials")} />
        <StatCard tone="primary" icon={<UserPlus aria-hidden />} value={c.enrollments} label={t("cards.enrollments")} />
        <StatCard tone="fia" icon={<GraduationCap aria-hidden />} value={c.completedTopics} label={t("cards.completedTopics")} />
        <StatCard tone="warning" icon={<Award aria-hidden />} value={c.certificates} label={t("cards.certificates")} />
        <StatCard tone="azure" icon={<CreditCard aria-hidden />} value={c.payments} label={t("cards.payments")} />
        <StatCard tone="navy" icon={<Wallet aria-hidden />} value={formatMoney(c.revenueCents, "USD", locale)} label={t("cards.revenue")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ActivityChart stats={stats} />
        <PassFailCard stats={stats} />
        <TestPerformanceCard stats={stats} />
        <SubjectProgressCard stats={stats} />
      </div>
    </>
  );
}
