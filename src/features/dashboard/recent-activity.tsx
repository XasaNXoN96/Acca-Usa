import Link from "next/link";
import { BookOpenCheck, ClipboardCheck, FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { formatRelative } from "@/lib/format";
import type { ActivityItem } from "@/types";

const icons = { topic: BookOpenCheck, test: ClipboardCheck, material: FileText } as const;

export async function RecentActivity({ items }: { items: ActivityItem[] }) {
  const [t, locale] = await Promise.all([getTranslations("dashboard"), getLocale()]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("recentActivity")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title={t("noActivity")} className="border-0 py-6" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((a) => {
              const Icon = icons[a.kind];
              return (
                <li key={a.id}>
                  <Link href={a.href} className="flex min-h-14 items-center gap-3 py-2.5 hover:bg-muted/40 sm:-mx-2 sm:rounded-lg sm:px-2">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-soft text-navy">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{a.context}</span>
                      <span className="type-caption block truncate text-muted-foreground">{a.title}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {a.detail ? <span className="block text-sm font-semibold tabular-nums">{a.detail}</span> : null}
                      <span className="type-caption block text-muted-foreground">{formatRelative(a.occurredAt, locale)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
