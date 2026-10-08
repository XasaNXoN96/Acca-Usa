"use client";

import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function QuestionNavigator({
  ids,
  answers,
  flagged,
  current,
  onGo,
}: {
  ids: string[];
  answers: Record<string, string>;
  flagged: string[];
  current: number;
  onGo: (index: number) => void;
}) {
  const t = useTranslations("test");
  return (
    <Card className="space-y-4 p-4">
      <h2 className="type-small font-semibold">{t("questionNavigator")}</h2>
      <ol className="grid grid-cols-5 gap-2">
        {ids.map((id, i) => {
          const answered = id in answers;
          const isFlagged = flagged.includes(id);
          const isCurrent = i === current;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-label={`${t("goToQuestion", { n: i + 1 })}${answered ? ` — ${t("legend.answered")}` : ` — ${t("legend.unanswered")}`}${isFlagged ? `, ${t("legend.flagged")}` : ""}`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "relative grid size-11 w-full place-items-center rounded-lg border-2 text-sm font-bold tabular-nums transition-colors",
                  isCurrent ? "border-navy bg-navy text-navy-foreground" : answered ? "border-navy/30 bg-navy-soft text-navy" : "border-border bg-background text-muted-foreground hover:border-navy/40",
                )}
              >
                {i + 1}
                {isFlagged ? (
                  <Flag className={cn("absolute -right-1 -top-1 size-4 fill-warning text-warning drop-shadow-[0_0_2px_white]")} aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="type-caption grid grid-cols-2 gap-x-3 gap-y-1.5 text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-navy" aria-hidden />{t("legend.current")}</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-navy/30 bg-navy-soft" aria-hidden />{t("legend.answered")}</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-border bg-background" aria-hidden />{t("legend.unanswered")}</li>
        <li className="flex items-center gap-1.5"><Flag className="size-3 fill-warning text-warning" aria-hidden />{t("legend.flagged")}</li>
      </ul>
    </Card>
  );
}
