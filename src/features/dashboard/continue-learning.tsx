import Link from "next/link";
import { Play } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/lib/routes";
import type { DashboardOverview } from "@/types";

export async function ContinueLearning({ items }: { items: DashboardOverview["continueLearning"] }) {
  const t = await getTranslations("dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("continueLearning")}</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
