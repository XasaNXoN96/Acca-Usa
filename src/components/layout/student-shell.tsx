import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { services } from "@/services";
import { studentBottomNav, studentNav } from "@/lib/navigation";
import { requireSession } from "@/lib/auth/guards";

/** Student app frame (sidebar, top bar, bottom tabs). Requires a session. Used by the (student) layout and by mixed public/private routes. */
export async function StudentShell({ children }: { children: React.ReactNode }) {
  const [t, session] = await Promise.all([getTranslations("nav"), requireSession()]);
  const unread = await services.notifications.unreadCount(session.user.id);
  const labels: Record<string, string> = {
    dashboard: t("dashboard"), courses: t("courses"), acca: t("acca"), fia: t("fia"), exams: t("exams"),
    progress: t("progress"), ranking: t("ranking"), certificates: t("certificates"), payments: t("payments"),
    notifications: t("notifications"), profile: t("profile"),
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
