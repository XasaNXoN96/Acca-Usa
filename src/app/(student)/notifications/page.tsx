import type { Metadata } from "next";
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
import { requireSession } from "@/lib/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notificationsPage"))("title") };
}

export default async function NotificationsPage() {
  const session = await requireSession();
  const [t, locale, items] = await Promise.all([getTranslations("notificationsPage"), getLocale(), services.notifications.list(session.user.id)]);
  const unread = items.filter((i) => !i.read).length;
  // Codes + params are stored; prose is produced here in the user's language.
  const text = t as unknown as (key: string, params?: Record<string, string>) => string;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<MarkAllReadButton disabled={unread === 0} />} />
      {items.length === 0 ? (
        <EmptyState icon={<Bell aria-hidden />} title={t("empty")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={cn(!n.read && "bg-navy-soft/40")}>
                <NotificationLink id={n.id} href={notificationHref(n)} unread={!n.read}>
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{text(`codes.${n.code}.title`, n.params)}</span>
                      {!n.read ? <Badge variant="acca">{t("unread")}</Badge> : null}
                    </span>
                    <span className="type-small mt-0.5 block text-muted-foreground">{text(`codes.${n.code}.body`, n.params)}</span>
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
