import { Bell } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { MarkAllReadButton } from "@/features/notifications/mark-all-read";
import { NotificationLink } from "@/features/notifications/mark-read-button";
import { services } from "@/services";
import { formatRelative } from "@/lib/format";
import { notificationHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Notification list shared by the student page and the admin page. Only the stored CODE + params are kept in the
 * data layer; title and message are produced here in the viewer's language. Every item resolves to a concrete link
 * (test, material, result, certificate, admin screen…) — see notificationHref.
 */
export async function NotificationsView({ userId }: { userId: string }) {
  const [t, locale, items] = await Promise.all([getTranslations("notificationsPage"), getLocale(), services.notifications.list(userId)]);
  const unread = items.filter((i) => !i.read).length;
  const text = t as unknown as (key: string, params?: Record<string, string>) => string;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<MarkAllReadButton disabled={unread === 0} />} />
      <p className="sr-only" role="status" aria-live="polite">{t("unreadCount", { count: unread })}</p>
      {items.length === 0 ? (
        <EmptyState icon={<Bell aria-hidden />} title={t("empty")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border" data-notification-list>
            {items.map((n) => (
              <li key={n.id} data-notification={n.code} data-unread={!n.read} className={cn(!n.read && "bg-navy-soft/40")}>
                <NotificationLink id={n.id} href={notificationHref(n)} unread={!n.read}>
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{text(`codes.${n.code}.title`, n.params)}</span>
                      {!n.read ? <Badge variant="acca">{t("unread")}</Badge> : null}
                    </span>
                    <span className="type-small mt-0.5 block text-muted-foreground [overflow-wrap:anywhere]">{text(`codes.${n.code}.body`, n.params)}</span>
                  </span>
                  <span className="type-caption shrink-0 text-muted-foreground">{formatRelative(n.createdAt, locale)}</span>
                </NotificationLink>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
