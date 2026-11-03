import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { services } from "@/services";
import { studentBottomNav, studentNav } from "@/lib/navigation";
import { requireSession } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/app-mode";
import { VerifyEmailBanner } from "@/features/auth/verify-email-banner";

/** Student app frame (sidebar, top bar, bottom tabs). Requires a session. Used by the (student) layout and by mixed public/private routes. */
export async function StudentShell({ children }: { children: React.ReactNode }) {
  const [t, session] = await Promise.all([getTranslations("nav"), requireSession()]);
  const unread = await services.notifications.unreadCount(session.user.id);
  const labels: Record<string, string> = {
    dashboard: t("dashboard"), courses: t("courses"), acca: t("acca"), fia: t("fia"), exams: t("exams"),
    progress: t("progress"), ranking: t("ranking"), certificates: t("certificates"), payments: t("payments"),
    notifications: t("notifications"), profile: t("profile"), support: t("support"),
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
      {!isDemoMode && session.user.emailVerified === false ? <VerifyEmailBanner email={session.user.email} /> : null}
      {children}
    </AppShell>
  );
}
