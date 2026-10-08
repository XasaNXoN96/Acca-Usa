import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { StartTestButton } from "./start-test-button";
import { routes } from "@/lib/routes";
import type { TestSummary } from "@/types";

/** Pre-test screen: the timer only starts when the learner presses Start. */
export async function TestIntro({ test }: { test: TestSummary }) {
  const t = await getTranslations("test.intro");
  const c = await getTranslations("common");
  const stats = [
    { label: t("questions"), value: test.questionCount },
    { label: t("duration"), value: c("minutes", { count: test.durationMinutes }) },
    { label: t("passMark"), value: `${test.passMark}%` },
    { label: t("points"), value: test.totalPoints },
  ];
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo href={routes.dashboard} />
          <Button asChild variant="ghost" size="sm"><Link href={routes.subjectTab(test.subjectSlug, "tests")}>{t("backToSubject")}</Link></Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="container-page max-w-2xl py-8 outline-none sm:py-14">
        <Card className="space-y-6 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-cima-soft text-cima"><ClipboardList className="size-6" aria-hidden /></span>
            <div className="min-w-0 space-y-1">
              <h1 className="type-h1 text-balance">{test.title}</h1>
              <p className="text-muted-foreground">{t("startText", { minutes: test.durationMinutes })}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-background p-3 text-center">
                <dd className="text-xl font-bold tabular-nums">{s.value}</dd>
                <dt className="type-caption text-muted-foreground">{s.label}</dt>
              </div>
            ))}
          </dl>
          {test.bestScore !== undefined ? <Badge variant={test.bestScore >= test.passMark ? "success" : "warning"}>{t("previousBest", { score: test.bestScore })}</Badge> : null}
          <StartTestButton testId={test.id} resume={false} />
        </Card>
      </main>
    </>
  );
}
