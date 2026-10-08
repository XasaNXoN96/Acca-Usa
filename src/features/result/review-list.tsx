"use client";

import { useState } from "react";
import { Check, CircleDashed, Flag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import type { ReviewItem } from "@/types";

type Filter = "all" | "incorrect" | "flagged";

/**
 * Review colours carry meaning ONLY here: green = correct answer, red = the learner's wrong answer.
 * Every state also has an icon and a text label, so colour is never the sole signal.
 */
export function ReviewList({ items }: { items: ReviewItem[] }) {
  const t = useTranslations("result");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = items.filter((i) => (filter === "all" ? true : filter === "incorrect" ? !i.isCorrect : i.flagged));
  const filters: Filter[] = ["all", "incorrect", "flagged"];

  return (
    <section id="review" aria-labelledby="review-title" className="scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="review-title" className="type-h2">{t("reviewTitle")}</h2>
        <div role="group" aria-label={t("reviewTitle")} className="flex gap-1 rounded-xl bg-muted p-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none",
                filter === f ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t("noItems")} />
      ) : (
        <ol className="space-y-4">
          {visible.map((item) => (
            <li key={item.questionId}>
              <ReviewCard item={item} number={items.indexOf(item) + 1} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReviewCard({ item, number }: { item: ReviewItem; number: number }) {
  const t = useTranslations("result");
  const status = item.selectedOptionId === null ? "unanswered" : item.isCorrect ? "correct" : "incorrect";
  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-pretty">
          <span className="mr-2 text-muted-foreground">{number}.</span>
          {item.text}
        </h3>
        <div className="flex items-center gap-2">
          {item.flagged ? (
            <Badge variant="warning">
              <Flag className="fill-current" aria-hidden />
              <span className="sr-only">{t("flaggedLabel")}</span>
            </Badge>
          ) : null}
          <Badge variant={status === "correct" ? "success" : status === "incorrect" ? "destructive" : "warning"}>
            {status === "correct" ? <Check aria-hidden /> : status === "incorrect" ? <X aria-hidden /> : <CircleDashed aria-hidden />}
            {t(`badge.${status}`)}
          </Badge>
        </div>
      </header>

      <ul className="grid gap-2">
        {item.options.map((o, i) => {
          const isCorrect = o.id === item.correctOptionId;
          const isMine = o.id === item.selectedOptionId;
          return (
            <li
              key={o.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border-2 p-3 text-sm",
                isCorrect && "border-success bg-success-soft",
                isMine && !isCorrect && "border-destructive bg-destructive-soft",
                !isCorrect && !isMine && "border-border",
              )}
            >
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-current/30 text-xs font-bold">
                {"ABCDEFGH"[i]}
              </span>
              <span className="min-w-0 flex-1">{o.text}</span>
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-semibold sm:flex-row sm:items-center sm:gap-2">
                {isMine ? <span className="rounded-full bg-background px-2 py-0.5 text-foreground ring-1 ring-border">{t("yourAnswer")}</span> : null}
                {isCorrect ? (
                  <span className="flex items-center gap-1 text-success">
                    <Check className="size-3.5" aria-hidden />
                    {t("correctAnswer")}
                  </span>
                ) : isMine ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <X className="size-3.5" aria-hidden />
                    {t("badge.incorrect")}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="rounded-lg bg-navy-soft p-4 text-sm">
        <p className="mb-1 font-semibold text-navy">{t("explanation")}</p>
        <p className="text-foreground/90">{item.explanation}</p>
      </div>
    </article>
  );
}
