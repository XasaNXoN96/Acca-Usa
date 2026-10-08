"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CloudOff, Loader2, LogOut, Send, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuestionCard } from "./question-card";
import { QuestionNavigator } from "./question-navigator";
import { LeaveTestDialog, SubmitTestDialog, TimeUpDialog } from "./test-dialogs";
import { useAutosave } from "./use-autosave";
import { useLeaveGuard } from "./use-leave-guard";
import { saveDraftAction, submitTestAction } from "./actions";
import { formatClock } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { AttemptDraft, TestForAttempt } from "@/types";

export function TestRunner({ test, draft, exitHref }: { test: TestForAttempt; draft: AttemptDraft; exitHref: string }) {
  const t = useTranslations("test");
  const router = useRouter();
  const total = test.questions.length;
  const limit = test.durationMinutes * 60;

  const [index, setIndex] = useState(() => Math.min(draft.currentIndex, Math.max(total - 1, 0)));
  const [answers, setAnswers] = useState<Record<string, string>>(draft.answers);
  const [flagged, setFlagged] = useState<string[]>(draft.flagged);
  const [elapsed, setElapsed] = useState(draft.elapsedSeconds);
  const elapsedRef = useRef(elapsed);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [done, setDone] = useState(false);
  const [showResumed, setShowResumed] = useState(() => draft.currentIndex > 0 || Object.keys(draft.answers).length > 0);
  const timeUpHandled = useRef(false);

  const guard = useLeaveGuard(!done, () => setLeaveOpen(true));

  // Timer: derived from wall-clock so background tabs and throttled intervals cannot drift.
  useEffect(() => {
    const startedAt = Date.now() - draft.elapsedSeconds * 1000;
    const id = setInterval(() => {
      const e = Math.floor((Date.now() - startedAt) / 1000);
      elapsedRef.current = e;
      setElapsed(e);
    }, 1000);
    return () => clearInterval(id);
  }, [draft.elapsedSeconds]);

  const remaining = Math.max(0, limit - elapsed);

  // Screen-reader announcement only inside two short windows (≈5 min and ≈1 min left), not every second.
  const announce =
    (remaining <= 300 && remaining > 295) || (remaining <= 60 && remaining > 55) ? `${t("timeRemaining")}: ${formatClock(remaining)}` : "";

  const snapshot = useMemo(() => ({ answers, flagged, currentIndex: index }), [answers, flagged, index]);
  const autosave = useAutosave(
    snapshot,
    async (v) => (await saveDraftAction({ testId: test.id, ...v })).ok,
    { enabled: !done },
  );

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(false);
    const res = await submitTestAction({ testId: test.id, answers, flagged });
    if (res.ok) {
      setDone(true);
      guard.allow();
      router.push(routes.testResult(test.id, res.attemptId));
    } else if (res.code === "NO_ATTEMPT") {
      // The server already closed this attempt (deadline passed) — go to the result it produced.
      setDone(true);
      guard.allow();
      router.push(routes.testResult(test.id));
    } else {
      setSubmitting(false);
      setSubmitError(true);
      setTimeUp(false);
      timeUpHandled.current = false;
    }
  }, [answers, flagged, guard, router, test.id]);

  useEffect(() => {
    if (remaining === 0 && !timeUpHandled.current && !done) {
      timeUpHandled.current = true;
      setTimeUp(true);
      void submit();
    }
  }, [remaining, done, submit]);

  const question = test.questions[index];
  if (!question) return null;

  const answeredCount = test.questions.filter((q) => q.id in answers).length;
  const unanswered = total - answeredCount;
  const isLast = index === total - 1;
  const lowTime = remaining <= 300;

  const leave = async () => {
    // Flush the latest answers before leaving so "your progress is saved" is literally true.
    await saveDraftAction({ testId: test.id, answers, flagged, currentIndex: index }).catch(() => undefined);
    guard.allow();
    router.push(exitHref);
  };

  const firstUnanswered = test.questions.findIndex((q) => !(q.id in answers));

  return (
    <div className="min-h-dvh bg-app">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="container-page flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-2">
          <span className="text-lg font-extrabold tracking-tight" aria-label="ACCA USA">
            <span className="text-navy">ACCA</span> <span className="text-primary">USA</span>
          </span>
          <p className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground md:block">{test.title}</p>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <AutosaveIndicator status={autosave} />
            <div
              role="timer"
              aria-label={t("timeRemaining")}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5",
                lowTime ? "border-warning/40 bg-warning-soft text-warning" : "border-border bg-card",
              )}
            >
              <Timer className="size-4" aria-hidden />
              <span className="hidden text-xs font-medium sm:inline">{t("timeRemaining")}</span>
              <span className="text-base font-bold tabular-nums">{formatClock(remaining)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLeaveOpen(true)}>
              <LogOut aria-hidden />
              <span className="hidden sm:inline">{t("exit")}</span>
              <span className="sr-only sm:hidden">{t("exit")}</span>
            </Button>
          </div>
        </div>
        <div className="container-page pb-3">
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{t("answeredCount", { answered: answeredCount, total })}</span>
            <span>{Math.round((answeredCount / total) * 100)}%</span>
          </div>
          <Progress value={(answeredCount / total) * 100} tone="navy" label={t("progress")} className="h-1.5" />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="container-page grid gap-6 py-6 outline-none lg:grid-cols-[1fr_18rem] lg:py-8">
        <div className="min-w-0 space-y-5">
          {showResumed ? <Alert variant="info">{t("resumed")}</Alert> : null}

          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            total={total}
            selected={answers[question.id]}
            flagged={flagged.includes(question.id)}
            onSelect={(optionId) => {
              setShowResumed(false);
              setAnswers((a) => ({ ...a, [question.id]: optionId }));
            }}
            onToggleFlag={() => setFlagged((f) => (f.includes(question.id) ? f.filter((x) => x !== question.id) : [...f, question.id]))}
          />

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" size="lg" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ArrowLeft aria-hidden />
              {t("previous")}
            </Button>
            {isLast ? (
              <Button size="lg" onClick={() => setSubmitOpen(true)}>
                <Send aria-hidden />
                {t("submit")}
              </Button>
            ) : (
              <Button variant="navy" size="lg" onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>
                {t("next")}
                <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-40 lg:self-start">
          <QuestionNavigator ids={test.questions.map((q) => q.id)} answers={answers} flagged={flagged} current={index} onGo={(i) => {
              setShowResumed(false);
              setIndex(i);
            }} />
          {!isLast ? (
            <Button variant="outline" className="w-full" onClick={() => setSubmitOpen(true)}>
              <Send aria-hidden />
              {t("submit")}
            </Button>
          ) : null}
        </aside>
      </main>

      <div className="sr-only" aria-live="polite" role="status">{announce}</div>

      <LeaveTestDialog open={leaveOpen} onOpenChange={setLeaveOpen} onLeave={leave} />
      <SubmitTestDialog
        open={submitOpen && !timeUp}
        onOpenChange={setSubmitOpen}
        unanswered={unanswered}
        flagged={flagged.length}
        submitting={submitting}
        error={submitError}
        onReview={() => {
          setSubmitOpen(false);
          if (firstUnanswered >= 0) setIndex(firstUnanswered);
        }}
        onConfirm={submit}
      />
      <TimeUpDialog open={timeUp} />
    </div>
  );
}

function AutosaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "failed" }) {
  const t = useTranslations("test.autosave");
  const map = {
    idle: { icon: <Check className="size-3.5" aria-hidden />, text: t("idle"), cls: "text-muted-foreground" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />, text: t("saving"), cls: "text-muted-foreground" },
    saved: { icon: <Check className="size-3.5" aria-hidden />, text: t("saved"), cls: "text-success" },
    failed: { icon: <CloudOff className="size-3.5" aria-hidden />, text: t("failed"), cls: "text-destructive" },
  } as const;
  const s = map[status];
  return (
    <p role="status" aria-live="polite" className={cn("type-caption hidden items-center gap-1.5 font-medium md:flex", s.cls)}>
      {s.icon}
      {s.text}
    </p>
  );
}
