import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/lib/routes";
import type { DashboardOverview } from "@/types";

/** Progress per subject of the enrolled platforms (materials + tests). Real data only; empty state when nothing is enrolled. */
export async function SubjectProgress({ items }: { items: DashboardOverview["subjectProgress"] }) {
  const t = await getTranslations("dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("subjectProgress")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="type-small text-muted-foreground">{t("subjectProgressEmpty")}</p>
        ) : (
          <ul className="space-y-3" data-subject-progress>
            {items.slice(0, 6).map((s) => (
              <li key={s.subjectSlug}>
                <Link href={routes.subject(s.subjectSlug)} className="block min-h-11 space-y-1.5 rounded-lg py-1 hover:bg-muted/50">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">{s.platform.toUpperCase()} · {s.code} <span className="font-normal text-muted-foreground">{s.name}</span></span>
                    <span className="text-sm font-bold tabular-nums">{s.percent}%</span>
                  </span>
                  <Progress value={s.percent} tone="navy" label={`${s.code} ${s.percent}%`} className="h-1.5" />
                  <span className="type-caption text-muted-foreground">{t("topicsDone", { done: s.completedTopics, total: s.totalTopics })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
