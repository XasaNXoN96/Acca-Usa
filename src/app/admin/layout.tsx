import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { adminNav } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { services } from "@/services";
import { redirect } from "next/navigation";
import { getSessionForMfaSetup } from "@/lib/auth/session";
import { routes } from "@/lib/routes";
import { RecoveryHost } from "@/features/admin/recovery-host";
import { MfaSetup } from "@/features/admin/mfa-setup";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin | ACCA USA" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [r, ts, loaded] = await Promise.all([
    getTranslations("admin.resources"),
    getTranslations("admin"),
    getSessionForMfaSetup(),
  ]);
  if (!loaded) redirect(routes.login);
  const { session, setupRequired } = loaded;
  if (session.user.role !== "ADMIN") redirect(routes.dashboard);
  const unread = await services.notifications.unreadCount(session.user.id);
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
    access: r("access.title"),
    certificates: r("certificates.title"),
    payments: r("payments.title"),
    statistics: ts("statistics.title"),
    settings: ts("settings.title"),
    security: ts("security.title"),
    audit: ts("audit.title"),
  };
  return (
    <AppShell variant="admin" items={setupRequired ? [] : adminNav.filter((i) => !i.permission || can(session.user.role, i.permission))} labels={labels} unreadNotifications={unread} user={{ name: session.user.name, email: session.user.email }} demoMessage={ts("demoNotice")}>
      {/* Mandatory second factor not set up yet: NOTHING else under /admin is rendered (pages, data and actions all fail closed). */}
      <RecoveryHost>{setupRequired ? <MfaSetup user={session.user} required /> : children}</RecoveryHost>
    </AppShell>
  );
}
