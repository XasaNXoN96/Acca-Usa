import { CheckCircle2, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TestResult } from "@/types";

export async function ScoreSummary({ result }: { result: TestResult }) {
  const t = await getTranslations("result");
  const rows = [
    { label: t("total"), value: result.total },
    { label: t("pointsLabel"), value: `${result.earnedPoints} / ${result.totalPoints}` },
    { label: t("correct"), value: result.correct, tone: "text-success" },
    { label: t("incorrect"), value: result.incorrect, tone: result.incorrect > 0 ? "text-destructive" : undefined },
    ...(result.unanswered > 0 ? [{ label: t("unanswered"), value: result.unanswered, tone: "text-warning" }] : []),
    { label: t("time"), value: formatClock(result.timeSpentSeconds) },
  ];
  return (
    <Card className="mx-auto w-full max-w-xl space-y-6 p-6 text-center sm:p-8">
      <div className="space-y-3">
        <span className={cn("mx-auto grid size-20 place-items-center rounded-full", result.passed ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
          {result.passed ? <CheckCircle2 className="size-11" aria-hidden /> : <XCircle className="size-11" aria-hidden />}
        </span>
        <h1 className="type-h1">{t("title")}</h1>
        <Badge variant={result.passed ? "success" : "warning"} className="px-3 py-1 text-sm">
          {result.passed ? t("passedTitle") : t("failedTitle")}
        </Badge>
      </div>

      <div className="space-y-1">
        <p className="type-small text-muted-foreground">{t("yourScore")}</p>
        <p className="flex items-baseline justify-center gap-3">
          <span className="text-5xl font-extrabold tracking-tight">{t("scoreOf", { correct: result.correct, total: result.total })}</span>
          <span className={cn("text-3xl font-bold", result.passed ? "text-success" : "text-warning")}>{result.scorePercent}%</span>
        </p>
        <div className="mx-auto max-w-xs pt-2">
          <Progress value={result.scorePercent} tone={result.passed ? "success" : "navy"} label={`${t("yourScore")} ${result.scorePercent}%`} />
        </div>
        <p className="type-caption text-muted-foreground">{t("passMark", { mark: result.passMark })}</p>
      </div>

      <dl className="divide-y divide-border rounded-xl border border-border bg-background text-left text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className={cn("font-semibold tabular-nums", r.tone)}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
