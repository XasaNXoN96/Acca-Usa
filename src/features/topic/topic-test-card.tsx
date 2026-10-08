import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import type { TestSummary } from "@/types";

/** Entry point to a topic's test (visible on every screen size): Subject → Topic → Test → Start. */
export async function TopicTestCard({ test }: { test: TestSummary }) {
  const t = await getTranslations("topic.testCard");
  const attempted = test.bestScore !== undefined;
  const exhausted = test.attemptsAllowed > 0 && (test.attemptsUsed ?? 0) >= test.attemptsAllowed;
  return (
    <section aria-labelledby="topic-test" data-topic-test className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-azure-soft text-azure"><ClipboardCheck className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="topic-test" className="type-h3 text-pretty">{test.title}</h2>
        <p className="type-small text-muted-foreground">
          {t("meta", { questions: test.questionCount, minutes: test.durationMinutes, passMark: test.passMark })}
          {test.attemptsAllowed > 0 ? ` · ${t("attempts", { used: test.attemptsUsed ?? 0, allowed: test.attemptsAllowed })}` : ""}
        </p>
        {attempted ? <Badge variant={test.bestScore! >= test.passMark ? "success" : "warning"}>{t("best", { score: test.bestScore! })}</Badge> : null}
      </div>
      <Button asChild variant={attempted ? "outline" : "default"} className="w-full sm:w-auto">
        <Link href={routes.test(test.id)}>{exhausted ? t("result") : attempted ? t("retake") : t("start")}</Link>
      </Button>
    </section>
  );
}
