import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { services } from "@/services";
import { studentBottomNav, studentNav } from "@/lib/navigation";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const [t, session] = await Promise.all([getTranslations("nav"), services.auth.getSession("STUDENT")]);
  const unread = await services.notifications.unreadCount(session.user.id);
  const labels: Record<string, string> = {
    dashboard: t("dashboard"),
    courses: t("courses"),
    acca: t("acca"),
    cima: t("cima"),
    fia: t("fia"),
    exams: t("exams"),
    progress: t("progress"),
    ranking: t("ranking"),
    certificates: t("certificates"),
    payments: t("payments"),
    notifications: t("notifications"),
    profile: t("profile"),
  };
  return (
    <AppShell
      variant="student"
      items={studentNav}
      bottomItems={studentBottomNav}
      labels={labels}
      user={{ name: session.user.name, email: session.user.email }}
      unreadNotifications={unread}
    >
      {children}
    </AppShell>
  );
}
