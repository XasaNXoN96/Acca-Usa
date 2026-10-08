"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { markReadAction } from "./actions";

/** Marks one notification read, then follows its (server-resolved) target. */
export function NotificationLink({ id, href, unread, children }: { id: string; href: string | null; unread: boolean; children: React.ReactNode }) {
  const t = useTranslations("notificationsPage");
  const router = useRouter();
  const [, start] = useTransition();
  const onClick = () =>
    start(async () => {
      if (unread) await markReadAction(id);
      if (href) router.push(href);
    });
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={href ? t("open") : undefined}
      className="flex min-h-16 w-full items-start gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40"
    >
      {children}
    </button>
  );
}
