"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { QuestionCard } from "@/features/test/question-card";
import { QuestionNavigator } from "@/features/test/question-navigator";
import type { PublicQuestion } from "@/types";

export interface TestPreviewData {
  title: string;
  description: string;
  durationMinutes: number;
  passMark: number;
  attemptsAllowed: number;
  questions: PublicQuestion[];
}

/**
 * Admin test preview: the same question card and navigator students use, but entirely in memory — nothing is saved,
 * no attempt is created, no result is produced and the questions carry no answer key.
 */
export function TestPreview({ test }: { test: TestPreviewData }) {
  const t = useTranslations("admin.testPreview");
  const c = useTranslations("common");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const q = test.questions[index];

  return (
    <div className="space-y-4">
      <Alert variant="info"><Eye className="size-4" aria-hidden />{t("notice")}</Alert>
      {!started || !q ? (
        <div className="space-y-4">
          <h3 className="type-h3 text-balance">{test.title}</h3>
          {test.description ? <p className="text-pretty text-muted-foreground">{test.description}</p> : null}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t("questions"), test.questions.length],
              [t("duration"), c("minutes", { count: test.durationMinutes })],
              [t("passMark"), `${test.passMark}%`],
              [t("attempts"), test.attemptsAllowed === 0 ? t("unlimited") : test.attemptsAllowed],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border border-border p-2 text-center">
                <dd className="text-lg font-bold tabular-nums">{v}</dd>
                <dt className="type-caption text-muted-foreground">{k}</dt>
              </div>
            ))}
          </dl>
          <Button onClick={() => setStarted(true)} disabled={test.questions.length === 0}>{t("start")}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <QuestionCard
            key={q.id}
            question={q}
            index={index}
            total={test.questions.length}
            selected={answers[q.id]}
            flagged={flagged.includes(q.id)}
            onSelect={(o) => setAnswers((a) => ({ ...a, [q.id]: o }))}
            onToggleFlag={() => setFlagged((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id]))}
          />
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}><ArrowLeft aria-hidden />{c("previous")}</Button>
            <Button variant="navy" onClick={() => setIndex((i) => Math.min(test.questions.length - 1, i + 1))} disabled={index === test.questions.length - 1}>{c("next")}<ArrowRight aria-hidden /></Button>
          </div>
          <QuestionNavigator ids={test.questions.map((x) => x.id)} answers={answers} flagged={flagged} current={index} onGo={setIndex} />
        </div>
      )}
    </div>
  );
}
