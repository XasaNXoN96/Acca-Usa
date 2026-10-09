"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PracticeCheck, PracticeQuestion } from "@/types";
import { checkPracticeAction } from "./actions";

/** Practice one question at a time; each answer is graded by the server (the answer key is never in the page). */
export function PracticeRunner({ questions, backHref }: { questions: PracticeQuestion[]; backHref: string }) {
  const t = useTranslations("mistakes.practice");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [check, setCheck] = useState<PracticeCheck | null>(null);
  const [score, setScore] = useState(0);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const q = questions[index];

  if (!q) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center" data-practice-done>
        <h2 className="type-h2">{t("doneTitle")}</h2>
        <p data-practice-score>{t("score", { correct: score, total: questions.length })}</p>
        <Button asChild><Link href={backHref}>{t("backToMistakes")}</Link></Button>
      </div>
    );
  }

  const submit = () => picked && start(async () => {
    setError(false);
    const r = await checkPracticeAction({ questionId: q.id, optionId: picked });
    if (!r.ok) return setError(true);
    setCheck(r.check); if (r.check.correct) setScore((s) => s + 1);
  });
  const next = () => { setIndex((i) => i + 1); setPicked(null); setCheck(null); };
  const label = (id: string) => q.options.find((o) => o.id === id)?.text ?? "";

  return (
    <div className="space-y-4" data-practice>
      <p className="type-caption text-muted-foreground" aria-live="polite">{t("progress", { current: index + 1, total: questions.length })}</p>
      <fieldset className="space-y-3 rounded-xl border border-border bg-card p-4" disabled={!!check || pending}>
        <legend className="type-h3 px-1 [overflow-wrap:anywhere]">{q.text}</legend>
        {q.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- access-controlled API URL
          <img src={`/api/files/${encodeURIComponent(q.imageId)}`} alt="" className="max-h-64 rounded-lg" />
        ) : null}
        {q.options.map((o) => (
          <label key={o.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name={`practice-${q.id}`} value={o.id} checked={picked === o.id} onChange={() => setPicked(o.id)} className="mt-0.5" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{o.text}</span>
          </label>
        ))}
      </fieldset>
      {check ? (
        <div role="status" data-practice-feedback={check.correct ? "correct" : "wrong"} className={check.correct ? "space-y-1 rounded-xl border border-success/40 bg-success-soft p-4" : "space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 p-4"}>
          <p className="flex items-center gap-2 font-semibold">{check.correct ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <XCircle className="size-5 text-destructive" aria-hidden />}{check.correct ? t("correct") : t("wrong")}</p>
          {!check.correct ? <p className="text-sm">{t("correctAnswer", { answer: label(check.correctOptionId) })}</p> : null}
          {check.explanation ? <p className="text-sm text-muted-foreground">{check.explanation}</p> : null}
        </div>
      ) : null}
      {error ? <Alert variant="destructive">{t("failed")}</Alert> : null}
      <div className="flex gap-2">
        {check ? <Button type="button" onClick={next}>{index + 1 >= questions.length ? t("finish") : t("next")}</Button>
          : <Button type="button" disabled={!picked || pending} onClick={submit}>{t("check")}</Button>}
      </div>
    </div>
  );
}
