import Link from "next/link";
import { Check, ChevronRight, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { TopicWithStatus } from "@/types";

const badgeFor = { completed: "success", in_progress: "info", unlocked: "neutral", locked: "outline" } as const;

export async function TopicList({ topics }: { topics: TopicWithStatus[] }) {
  const [t, c] = await Promise.all([getTranslations("subject"), getTranslations("common")]);
  return (
    <ol className="space-y-2.5">
      {topics.map((topic) => {
        const locked = topic.status === "locked";
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold",
                topic.status === "completed" && "bg-success text-white",
                topic.status === "in_progress" && "bg-navy text-navy-foreground",
                topic.status === "unlocked" && "border-2 border-navy text-navy",
                locked && "bg-muted text-muted-foreground",
              )}
            >
              {topic.status === "completed" ? <Check className="size-4" strokeWidth={3} /> : locked ? <Lock className="size-4" /> : topic.order}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("font-semibold", locked && "text-muted-foreground")}>{topic.title}</span>
                <Badge variant={badgeFor[topic.status]}>{t(`status.${topic.status}`)}</Badge>
              </span>
              <span className="type-caption block text-muted-foreground">
                {c("lessonsCount", { count: topic.lessonCount })} · {c("minutes", { count: topic.durationMinutes })}
                {locked ? <span className="sr-only"> — {t("lockedHint")}</span> : null}
              </span>
              {topic.status === "in_progress" ? (
                <span className="flex items-center gap-2 pt-0.5">
                  <Progress value={topic.progress} tone="navy" label={`${topic.title} ${topic.progress}%`} className="h-1.5 max-w-48" />
                  <span className="type-caption font-semibold tabular-nums">{topic.progress}%</span>
                </span>
              ) : null}
            </span>
            {locked ? null : <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
          </>
        );
        return (
          <li key={topic.id}>
            {locked ? (
              <div aria-disabled="true" className="flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
                {body}
              </div>
            ) : (
              <Link
                href={routes.topic(topic.id)}
                className="flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs transition-shadow hover:shadow-md"
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
