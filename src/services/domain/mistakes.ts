import type { MistakeItem, PracticeCheck, PracticeQuestion, QuestionOption, ReviewItem, TestResult } from "@/types";
import type { MistakeService } from "../contracts";

/**
 * "Review your mistakes" + practice, derived from REAL data only: the frozen review of the learner's submitted attempts
 * and their practice answers. A question counts as an unresolved mistake while its LATEST outcome (a later test attempt or
 * a practice answer) is wrong / skipped. Explanations are shown only if the question has one. One implementation for both
 * data providers: they supply the raw records through `MistakeDeps`.
 */
export interface PracticeEvent { questionId: string; correct: boolean; at: string }
export interface BankQuestionNow { text: string; options: QuestionOption[]; correctOptionId: string; explanation: string; imageId?: string }
export interface MistakeDeps {
  results(userId: string): Promise<TestResult[]>;
  practice(userId: string): Promise<PracticeEvent[]>;
  /** The published, non-archived bank question as it is NOW, or null. */
  bank(questionId: string): Promise<BankQuestionNow | null>;
  record(userId: string, questionId: string, correct: boolean): Promise<void>;
}

const trimmed = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);

export function computeMistakes(results: TestResult[], practice: PracticeEvent[]): MistakeItem[] {
  type Ev = { at: string; order: number; correct: boolean; result?: TestResult; item?: ReviewItem };
  const byQuestion = new Map<string, Ev[]>();
  const push = (id: string, ev: Ev) => { const l = byQuestion.get(id); if (l) l.push(ev); else byQuestion.set(id, [ev]); };
  [...results].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).forEach((r, i) => {
    for (const item of r.review) push(item.questionId, { at: r.submittedAt, order: i * 2, correct: item.isCorrect, result: r, item });
  });
  practice.forEach((p, i) => { if (byQuestion.has(p.questionId)) push(p.questionId, { at: p.at, order: 1_000_000 + i, correct: p.correct }); });

  const out: MistakeItem[] = [];
  for (const [questionId, evs] of byQuestion) {
    const attempts = evs.filter((e) => e.result);
    const wrong = attempts.filter((e) => !e.correct);
    if (!wrong.length) continue; // never wrong → not a mistake
    const last = [...evs].sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order).at(-1)!;
    const shown = wrong.at(-1)!;
    const { result, item } = shown as { result: TestResult; item: ReviewItem };
    out.push({
      questionId, subjectSlug: result.subjectSlug, subjectName: result.subjectName, testId: result.testId, testTitle: result.testTitle, attemptId: result.attemptId,
      answeredAt: result.submittedAt, text: item.text, options: item.options, selectedOptionId: item.selectedOptionId, correctOptionId: item.correctOptionId,
      explanation: trimmed(item.explanation), wrongCount: wrong.length, practiceCount: evs.length - attempts.length, resolved: last.correct,
    });
  }
  // unresolved first, then the most often wrong, then the most recent
  return out.sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.wrongCount - a.wrongCount || b.answeredAt.localeCompare(a.answeredAt) || a.questionId.localeCompare(b.questionId));
}

export function createMistakeService(deps: MistakeDeps): MistakeService {
  const mine = async (userId: string) => computeMistakes(await deps.results(userId), await deps.practice(userId));
  return {
    async list(userId, filter) {
      return (await mine(userId)).filter((m) => !filter?.subjectSlug || m.subjectSlug === filter.subjectSlug);
    },
    async practiceSet(userId, { subjectSlug, limit }) {
      const open = (await mine(userId)).filter((m) => !m.resolved && (!subjectSlug || m.subjectSlug === subjectSlug)).slice(0, Math.max(0, limit));
      return Promise.all(open.map(async (m): Promise<PracticeQuestion> => {
        const now = await deps.bank(m.questionId); // current wording if the question still exists, otherwise what the learner saw
        return now ? { id: m.questionId, text: now.text, imageId: now.imageId, options: now.options } : { id: m.questionId, text: m.text, options: m.options };
      }));
    },
    async checkPractice(userId, questionId, optionId) {
      const m = (await mine(userId)).find((x) => x.questionId === questionId); // only questions the learner actually got wrong
      if (!m) return { ok: false, code: "NOT_FOUND" };
      const now = await deps.bank(questionId);
      const options = now?.options ?? m.options;
      const correctOptionId = now?.correctOptionId ?? m.correctOptionId;
      if (!options.some((o) => o.id === optionId)) return { ok: false, code: "INVALID" };
      const correct = optionId === correctOptionId;
      await deps.record(userId, questionId, correct);
      const data: PracticeCheck = { correct, correctOptionId, explanation: trimmed(now ? now.explanation : m.explanation) };
      return { ok: true, data };
    },
  };
}
