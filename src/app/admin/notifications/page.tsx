import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationsView } from "@/features/notifications/notifications-view";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notificationsPage"))("title") };
}

/** Admin notifications (new registrations, submitted tests, certificates, system events). */
export default async function AdminNotificationsPage() {
  const session = await requireSession(STAFF_ROLES);
  return <NotificationsView userId={session.user.id} />;
}
