import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { fileUrl } from "@/features/topic/material-viewers";
import type { BankQuestion } from "@/types";

/**
 * Admin preview of a bank question: student-like layout plus the answer key and explanation.
 * Server component, rendered only inside /admin (staff). Students never receive this markup.
 */
export async function QuestionPreview({ question }: { question: BankQuestion }) {
  const [t, a] = await Promise.all([getTranslations("admin.preview"), getTranslations("admin.answer")]);
  return (
    <div className="space-y-4">
      <p className="type-caption text-muted-foreground">{t("points", { points: question.points })}</p>
      <p className="text-pretty text-base font-semibold leading-relaxed [overflow-wrap:anywhere]">{question.text}</p>
      {question.imageId ? (
        // eslint-disable-next-line @next/next/no-img-element -- access-controlled API URL
        <img src={fileUrl(question.imageId)} alt={t("image")} className="max-h-64 w-full rounded-lg border border-border object-contain" />
      ) : null}
      <ul className="space-y-2">
        {question.options.map((o) => {
          const correct = o.id === question.correctOptionId;
          return (
            <li
              key={o.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${correct ? "border-success/50 bg-success-soft" : "border-border bg-card"}`}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold uppercase">{o.id}</span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{o.text}</span>
              {correct ? <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="size-4" aria-hidden />{t("correct", { letter: a(o.id as "a") })}</span> : null}
            </li>
          );
        })}
      </ul>
      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <p className="type-eyebrow mb-1 text-muted-foreground">{t("explanation")}</p>
        <p className="text-pretty [overflow-wrap:anywhere]">{question.explanation}</p>
      </div>
      <p className="type-caption text-muted-foreground">{t("adminOnly")}</p>
    </div>
  );
}
