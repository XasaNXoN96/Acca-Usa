import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { DashboardOverview } from "@/types";

/** Real data only: results from the learner's own attempts + published tests they have not taken yet. */
export async function TestsPreview({ results, available }: { results: DashboardOverview["recentResults"]; available: DashboardOverview["availableTests"] }) {
  const [t, st, locale] = await Promise.all([getTranslations("dashboard"), getTranslations("subject"), getLocale()]);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("recentResults")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {results.length === 0 ? (
          <p className="type-small text-muted-foreground">{t("noResults")}</p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.attemptId}>
                <Link href={routes.testResult(r.testId, r.attemptId)} className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/50">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-azure-soft text-azure"><ClipboardList className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.testTitle}</span>
                    <span className="type-caption block truncate text-muted-foreground">{r.subjectName} · {formatRelative(r.submittedAt, locale)}</span>
                  </span>
                  <Badge variant={r.passed ? "success" : "warning"}>{r.scorePercent}% · {r.passed ? t("passed") : t("failed")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <h3 className="type-small font-semibold text-muted-foreground">{t("availableTests")}</h3>
          {available.length === 0 ? (
            <p className="type-small text-muted-foreground">{t("noTests")}</p>
          ) : (
            <ul className="space-y-2">
              {available.map(({ test, subjectName }) => (
                <li key={test.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{test.title}</span>
                    <span className="type-caption block truncate text-muted-foreground">{subjectName} · {st("questions", { count: test.questionCount })}</span>
                  </span>
                  <Button asChild size="sm" variant="outline"><Link href={routes.test(test.id)}>{t("startTest")}</Link></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
