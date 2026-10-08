import "server-only";
import { randomUUID } from "node:crypto";
import type {
  CertificateService,
  ExamService,
  ProgressService,
  RankingService,
  TestService,
} from "../contracts";
import type { PlatformSlug, ReviewItem, TestResult, TestSummary } from "@/types";
import { questionBank, testRecords, type TestRecord } from "@/data/mock/assessments";
import { activitySeeds, certificates, exams, ranking } from "@/data/mock/people";
import { allTopics, getSubject, getTopic, subjects, topicsBySubject } from "@/data/mock/catalog";
import { getUserProgress, store } from "./store";
import { routes } from "@/lib/routes";

const questionById = new Map(questionBank.map((q) => [q.id, q]));

function summaryOf(rec: TestRecord, userId?: string): TestSummary {
  let bestScore: number | undefined;
  if (userId) {
    const scores = [...store.attempts.values()].filter((a) => a.userId === userId && a.testId === rec.id).map((a) => a.scorePercent);
    if (scores.length) bestScore = Math.max(...scores);
  }
  return {
    id: rec.id,
    subjectSlug: rec.subjectSlug,
    topicId: rec.topicId,
    title: rec.title,
    questionCount: rec.questionIds.length,
    durationMinutes: rec.durationMinutes,
    passMark: rec.passMark,
    bestScore,
  };
}

function subjectPercent(userId: string, subjectSlug: string) {
  const topics = topicsBySubject[subjectSlug] ?? [];
  const p = getUserProgress(userId);
  const total = topics.length;
  const sum = topics.reduce((acc, t) => acc + Math.min(100, p[t.id] ?? 0), 0);
  const completed = topics.filter((t) => (p[t.id] ?? 0) >= 100).length;
  return { percent: total ? Math.round(sum / total) : 0, completed, total };
}

function buildReview(rec: TestRecord, answers: Record<string, string>, flagged: string[]): ReviewItem[] {
  return rec.questionIds.flatMap((id) => {
    const q = questionById.get(id);
    if (!q) return [];
    const selected = answers[id] ?? null;
    return [
      {
        questionId: q.id,
        text: q.text,
        options: q.options,
        selectedOptionId: selected,
        correctOptionId: q.correctOptionId,
        explanation: q.explanation,
        isCorrect: selected === q.correctOptionId,
        flagged: flagged.includes(id),
      },
    ];
  });
}

function buildResult(
  rec: TestRecord,
  review: ReviewItem[],
  extra: { attemptId: string; timeSpentSeconds: number; submittedAt: string; progressBefore: number; progressAfter: number; isDemo: boolean },
): TestResult {
  const correct = review.filter((r) => r.isCorrect).length;
  const unanswered = review.filter((r) => r.selectedOptionId === null).length;
  const total = review.length;
  const scorePercent = total ? Math.round((correct / total) * 100) : 0;
  return {
    testId: rec.id,
    testTitle: rec.title,
    subjectSlug: rec.subjectSlug,
    subjectName: getSubject(rec.subjectSlug)?.name ?? rec.subjectSlug,
    total,
    correct,
    incorrect: total - correct - unanswered,
    unanswered,
    scorePercent,
    passMark: rec.passMark,
    passed: scorePercent >= rec.passMark,
    review,
    ...extra,
  };
}

export const testService: TestService = {
  async listAll() {
    return testRecords.map((r) => summaryOf(r));
  },
  async listForSubject(subjectSlug, userId) {
    return testRecords.filter((r) => r.subjectSlug === subjectSlug).map((r) => summaryOf(r, userId));
  },
  async getSummary(testId) {
    const rec = testRecords.find((r) => r.id === testId);
    return rec ? summaryOf(rec) : null;
  },
  async getForAttempt(testId) {
    const rec = testRecords.find((r) => r.id === testId);
    if (!rec) return null;
    return {
      ...summaryOf(rec),
      // Correct answers and explanations are deliberately omitted here.
      questions: rec.questionIds.flatMap((id) => {
        const q = questionById.get(id);
        return q ? [{ id: q.id, text: q.text, options: q.options }] : [];
      }),
    };
  },
  async submit({ userId, testId, answers, flagged, elapsedSeconds }) {
    const rec = testRecords.find((r) => r.id === testId);
    if (!rec) throw new Error("NOT_FOUND");
    // Only accept answers for known questions/options (never trust client input).
    const validAnswers: Record<string, string> = {};
    for (const id of rec.questionIds) {
      const q = questionById.get(id);
      const given = answers[id];
      if (q && given && q.options.some((o) => o.id === given)) validAnswers[id] = given;
    }
    const before = subjectPercent(userId, rec.subjectSlug).percent;
    const review = buildReview(rec, validAnswers, flagged.filter((f) => rec.questionIds.includes(f)));
    const preview = buildResult(rec, review, { attemptId: "", timeSpentSeconds: 0, submittedAt: "", progressBefore: before, progressAfter: before, isDemo: false });
    if (preview.passed && rec.topicId) {
      const p = getUserProgress(userId);
      p[rec.topicId] = 100;
    }
    const after = subjectPercent(userId, rec.subjectSlug).percent;
    const attemptId = randomUUID();
    const result = buildResult(rec, review, {
      attemptId,
      timeSpentSeconds: Math.min(Math.max(0, Math.floor(elapsedSeconds)), rec.durationMinutes * 60),
      submittedAt: new Date().toISOString(),
      progressBefore: before,
      progressAfter: after,
      isDemo: false,
    });
    store.attempts.set(attemptId, { ...result, userId });
    store.drafts.delete(`${userId}:${testId}`);
    return { attemptId };
  },
  async getResult(testId, userId, attemptId) {
    const rec = testRecords.find((r) => r.id === testId);
    if (!rec) return null;
    if (attemptId) {
      const a = store.attempts.get(attemptId);
      if (a && a.userId === userId && a.testId === testId) return a;
    } else {
      const mine = [...store.attempts.values()].filter((a) => a.userId === userId && a.testId === testId);
      const latest = mine.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
      if (latest) return latest;
    }
    // Deterministic sample so the page is demonstrable without taking the test first.
    const demoAnswers: Record<string, string> = {};
    rec.questionIds.forEach((id, i) => {
      const q = questionById.get(id);
      if (!q) return;
      const wrong = q.options.find((o) => o.id !== q.correctOptionId)?.id ?? q.correctOptionId;
      demoAnswers[id] = i < Math.ceil(rec.questionIds.length * 0.8) ? q.correctOptionId : wrong;
    });
    const p = subjectPercent(userId, rec.subjectSlug).percent;
    return buildResult(rec, buildReview(rec, demoAnswers, []), {
      attemptId: "demo",
      timeSpentSeconds: Math.round(rec.durationMinutes * 60 * 0.34),
      submittedAt: new Date().toISOString(),
      progressBefore: Math.max(0, p - 14),
      progressAfter: p,
      isDemo: true,
    });
  },
  async saveDraft(userId, draft) {
    // Mock: kept in memory. Real implementation: upsert into TestAttempt (status = IN_PROGRESS).
    store.drafts.set(`${userId}:${draft.testId}`, draft);
    return { savedAt: new Date().toISOString() };
  },
  async loadDraft(userId, testId) {
    return store.drafts.get(`${userId}:${testId}`) ?? null;
  },
  async listQuestions() {
    return questionBank.map((q) => ({ id: q.id, text: q.text, options: q.options.length }));
  },
};

export const examService: ExamService = {
  async list() {
    return exams;
  },
};

export const progressService: ProgressService = {
  async getTopicProgress(userId) {
    return { ...getUserProgress(userId) };
  },
  async markTopicCompleted(userId, topicId) {
    if (!getTopic(topicId)) throw new Error("NOT_FOUND");
    getUserProgress(userId)[topicId] = 100;
  },
  async getSubjectProgress(userId, subjectSlug) {
    return subjectPercent(userId, subjectSlug);
  },
  async getPlatformProgress() {
    // Demo values; the real service aggregates enrolled subjects.
    return { acca: 65, cima: 42, fia: 0 } satisfies Record<PlatformSlug, number>;
  },
  async recentActivity() {
    return activitySeeds.map((a) => {
      const base = { id: a.id, kind: a.kind, title: a.title, context: a.context, detail: a.detail, occurredAt: new Date(Date.now() - a.hoursAgo * 3_600_000).toISOString() };
      const t = a as { topicId?: string; testId?: string };
      return { ...base, href: t.topicId ? routes.topic(t.topicId) : routes.testResult(t.testId ?? "") };
    });
  },
};

export const rankingService: RankingService = {
  async top(userId, limit) {
    return ranking.slice(0, Math.max(limit, 0)).map((r) => ({ ...r, isCurrentUser: r.userId === userId }));
  },
};

export const certificateService: CertificateService = {
  async listForUser() {
    return certificates;
  },
};

export const learningInternals = { subjectPercent, allTopicsCount: allTopics.length, subjectsCount: subjects.length };
