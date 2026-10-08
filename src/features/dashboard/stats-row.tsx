import { BookOpen, CheckCircle2, Clock, GraduationCap, TrendingUp } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardOverview } from "@/types";

export async function StatsRow({ stats }: { stats: DashboardOverview["stats"] }) {
  const [t, f] = await Promise.all([getTranslations("dashboard.stats"), getFormatter()]);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard tone="primary" icon={<BookOpen aria-hidden />} value={stats.enrolledCourses} label={t("courses")} />
      <StatCard tone="navy" icon={<GraduationCap aria-hidden />} value={stats.enrolledSubjects} label={t("subjects")} />
      <StatCard tone="azure" icon={<CheckCircle2 aria-hidden />} value={stats.completedTopics} label={t("topics")} />
      <StatCard tone="warning" icon={<Clock aria-hidden />} value={t("hoursValue", { hours: stats.learningHours })} label={t("hours")} />
      <StatCard tone="fia" icon={<TrendingUp aria-hidden />} value={f.number(stats.overallProgress / 100, { style: "percent" })} label={t("progress")} className="col-span-2 lg:col-span-1" />
    </div>
  );
}
