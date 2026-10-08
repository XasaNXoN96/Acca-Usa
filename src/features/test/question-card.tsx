"use client";

import { Check, Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicQuestion } from "@/types";

/**
 * Answer options use NAVY for "selected". Red is reserved for errors and only appears on the
 * result/review screens, together with an icon and a text label — so selection is never confused with a mistake.
 */
export function QuestionCard({
  question,
  index,
  total,
  selected,
  flagged,
  onSelect,
  onToggleFlag,
}: {
  question: PublicQuestion;
  index: number;
  total: number;
  selected: string | undefined;
  flagged: boolean;
  onSelect: (optionId: string) => void;
  onToggleFlag: () => void;
}) {
  const t = useTranslations("test");
  const labelId = `q-${question.id}-label`;
  return (
    <section aria-labelledby={labelId} className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <p className="type-small font-semibold text-muted-foreground">{t("question", { current: index + 1, total })}</p>
        <Button
          variant={flagged ? "navy" : "outline"}
          size="sm"
          onClick={onToggleFlag}
          aria-pressed={flagged}
        >
          <Flag className={cn(flagged && "fill-current")} aria-hidden />
          {flagged ? t("unflag") : t("flag")}
        </Button>
      </div>

      <h2 id={labelId} className="type-h2 text-pretty !text-xl sm:!text-2xl">
        {question.text}
      </h2>

      <RadioGroup.Root
        value={selected ?? ""}
        onValueChange={onSelect}
        aria-labelledby={labelId}
        className="grid gap-3"
      >
        {question.options.map((o, i) => {
          const isSelected = selected === o.id;
          return (
            <RadioGroup.Item
              key={o.id}
              value={o.id}
              className={cn(
                "group flex min-h-14 w-full items-center gap-3 rounded-xl border-2 bg-background p-3 text-left transition-colors",
                isSelected ? "border-navy bg-navy-soft" : "border-border hover:border-navy/40 hover:bg-muted/50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-bold",
                  isSelected ? "border-navy bg-navy text-navy-foreground" : "border-input text-muted-foreground",
                )}
              >
                {"ABCDEFGH"[i]}
              </span>
              <span className="min-w-0 flex-1 text-base">{o.text}</span>
              {isSelected ? (
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-navy">
                  <Check className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{t("selected")}</span>
                </span>
              ) : null}
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
      <p className="type-caption text-muted-foreground">{t("chooseAnswer")}</p>
    </section>
  );
}
