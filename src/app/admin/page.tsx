import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardList, Library, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { navIcons } from "@/components/layout/nav-icons";
import { services } from "@/services";
import { adminNav } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.overview"))("title") };
}

export default async function AdminHome() {
  const session = await requireSession(STAFF_ROLES);
  const [t, r, ts, students, subjects, topics, tests] = await Promise.all([
    getTranslations("admin.overview"),
    getTranslations("admin.resources"),
    getTranslations("admin"),
    services.users.listStudents(),
    services.subjects.list(),
    services.topics.listAll(),
    services.tests.listAllForAdmin(),
  ]);
  const titles: Record<string, string> = {
    platforms: r("platforms.title"), subjects: r("subjects.title"), topics: r("topics.title"), materials: r("materials.title"),
    "question-bank": r("question-bank.title"), tests: r("tests.title"), exams: r("exams.title"), students: r("students.title"), certificates: r("certificates.title"),
    payments: r("payments.title"), statistics: ts("statistics.title"), settings: ts("settings.title"),
  };
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="primary" icon={<Users aria-hidden />} value={students.length} label={t("students")} />
        <StatCard tone="azure" icon={<Library aria-hidden />} value={subjects.length} label={t("subjects")} />
        <StatCard tone="fia" icon={<BookOpen aria-hidden />} value={topics.length} label={t("topics")} />
        <StatCard tone="warning" icon={<ClipboardList aria-hidden />} value={tests.length} label={t("tests")} />
      </div>
      <section aria-labelledby="manage" className="space-y-3">
        <h2 id="manage" className="type-h3">{t("quickLinks")}</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {adminNav.filter((i) => i.icon !== "overview" && (!i.permission || can(session.user.role, i.permission))).map((item) => {
            const Icon = navIcons[item.icon];
            return (
              <li key={item.href}>
                <Card interactive className="p-0">
                  <Link href={item.href} className="flex min-h-16 flex-col items-start gap-2 rounded-xl p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-soft text-navy">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="font-semibold">{titles[item.labelKey]}</span>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
