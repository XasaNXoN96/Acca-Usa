import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/lib/routes";
import type { DashboardOverview } from "@/types";

export async function ContinueLearning({ items, last }: { items: DashboardOverview["continueLearning"]; last: DashboardOverview["lastMaterial"] }) {
  const t = await getTranslations("dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("continueLearning")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {last ? (
          <div data-continue-material className="flex flex-col gap-3 rounded-xl border border-navy/20 bg-navy-soft p-4 sm:flex-row sm:items-center">
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-navy text-navy-foreground"><Play className="size-5 fill-current" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="type-caption font-semibold text-navy">{last.platform.toUpperCase()} · {last.subjectCode} · {t("topicN", { n: last.topicNumber })} · {t("materialN", { n: last.materialNumber })}</p>
              <p className="truncate font-semibold">{last.materialTitle}</p>
              <p className="type-caption truncate text-muted-foreground">{last.topicTitle}</p>
            </div>
            <Button asChild className="w-full sm:w-auto"><Link href={routes.subjectMaterial(last.subjectSlug, last.topicId, last.materialId)}>{t("continue")}<ArrowRight aria-hidden /></Link></Button>
          </div>
        ) : null}
        {items.length === 0 ? (
          last ? null : <p className="type-small text-muted-foreground">{t("continueEmpty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <li key={i.topicId}>
                <Link href={routes.topic(i.topicId)} className="group flex min-h-16 items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-navy text-navy-foreground">
                    <Play className="size-5 fill-current" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{i.subjectName}</span>
                    <span className="type-caption block truncate text-muted-foreground">{i.topicTitle}</span>
                    <Progress value={i.progress} tone="navy" label={`${i.topicTitle} ${i.progress}%`} className="mt-2 h-1.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
