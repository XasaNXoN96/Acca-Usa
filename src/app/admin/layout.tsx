import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { services } from "@/services";
import { adminNav } from "@/lib/navigation";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin | ACCA USA" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [r, ts, session] = await Promise.all([
    getTranslations("admin.resources"),
    getTranslations("admin"),
    services.auth.getSession("ADMIN"),
  ]);
  const labels: Record<string, string> = {
    overview: ts("overview.title"),
    platforms: r("platforms.title"),
    subjects: r("subjects.title"),
    topics: r("topics.title"),
    materials: r("materials.title"),
    "question-bank": r("question-bank.title"),
    tests: r("tests.title"),
    exams: r("exams.title"),
    students: r("students.title"),
    payments: r("payments.title"),
    statistics: ts("statistics.title"),
    settings: ts("settings.title"),
  };
  return (
    <AppShell variant="admin" items={adminNav} labels={labels} user={{ name: session.user.name, email: session.user.email }} demoMessage={ts("demoNotice")}>
      {children}
    </AppShell>
  );
}
