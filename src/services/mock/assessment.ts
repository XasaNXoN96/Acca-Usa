import "server-only";
import type { AttemptStart, QuestionInput, QuestionService, ServiceResult, TestInput, TestService } from "../contracts";
import type { BankQuestion, ResultListItem, ReviewItem, TestResult, TestSummary } from "@/types";
import { routes } from "@/lib/routes";
import { getStorage } from "../storage";
import {
  getDb, newId, nowIso, pushActivity, pushNotification, subjectVisible, topicVisible, userProgress,
  type AttemptRec, type Db, type QuestionRec, type TestRec,
} from "./db";
import { subjectProgress } from "./calc";

const GRACE_MS = 60_000;
const LETTERS = ["a", "b", "c", "d"] as const;

/* ---------------- question bank ---------------- */

const toBank = (q: QuestionRec): BankQuestion => ({
  id: q.id, subjectSlug: q.subjectSlug, topicId: q.topicId, tags: q.tags, imageId: q.imageId, text: q.text, options: q.options,
  correctOptionId: q.correctOptionId, explanation: q.explanation, points: q.points, difficulty: q.difficulty,
  status: q.deletedAt ? "archived" : q.status, archived: !!q.deletedAt, createdAt: q.createdAt, updatedAt: q.updatedAt,
});

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 10);

function checkQuestion(db: Db, input: QuestionInput): { ok: false; code: string; field?: string } | null {
  if (!db.subjects.some((s) => s.slug === input.subjectSlug && !s.deletedAt)) return { ok: false, code: "NOT_FOUND", field: "subject" };
  if (input.topicId) {
    const topic = db.topics.find((t) => t.id === input.topicId && !t.deletedAt);
    if (!topic || topic.subjectSlug !== input.subjectSlug) return { ok: false, code: "TOPIC_MISMATCH", field: "topic" };
  }
  return null;
}

export const questionService: QuestionService = {
  async list() {
    return getDb().questions.map(toBank);
  },
  async create(input) {
    const db = getDb();
    const bad = checkQuestion(db, input);
    if (bad) return bad;
    const now = nowIso();
    const rec: QuestionRec = {
      id: newId("q"), subjectSlug: input.subjectSlug, topicId: input.topicId || undefined, text: input.text.trim(),
      options: input.options.map((text, i) => ({ id: LETTERS[i]!, text: text.trim() })),
      correctOptionId: LETTERS[input.correctIndex]!, explanation: input.explanation.trim(), points: input.points,
      difficulty: input.difficulty, tags: cleanTags(input.tags), imageId: input.imageId || undefined, status: input.status,
      createdAt: now, updatedAt: now,
    };
    db.questions.push(rec);
    if (rec.imageId) await getStorage().markAttached(rec.imageId, true);
    return { ok: true, data: { id: rec.id } };
  },
  async update(id, input) {
    const db = getDb();
    const rec = db.questions.find((q) => q.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    const bad = checkQuestion(db, input);
    if (bad) return bad;
    const nextImage = input.imageId || undefined;
    if (rec.imageId && rec.imageId !== nextImage) await getStorage().delete(rec.imageId);
    if (nextImage && nextImage !== rec.imageId) await getStorage().markAttached(nextImage, true);
    Object.assign(rec, {
      subjectSlug: input.subjectSlug, topicId: input.topicId || undefined, text: input.text.trim(),
      options: input.options.map((text, i) => ({ id: LETTERS[i]!, text: text.trim() })),
      correctOptionId: LETTERS[input.correctIndex]!, explanation: input.explanation.trim(), points: input.points, difficulty: input.difficulty,
      tags: cleanTags(input.tags), imageId: nextImage, status: input.status, updatedAt: nowIso(),
    });
    return { ok: true, data: undefined };
  },
  async setArchived(id, archived) {
    const rec = getDb().questions.find((q) => q.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    rec.deletedAt = archived ? nowIso() : undefined;
    rec.updatedAt = nowIso();
    return { ok: true, data: undefined };
  },
  async imageAccess(fileId) {
    const db = getDb();
    const q = db.questions.find((x) => x.imageId === fileId && !x.deletedAt && x.status === "published");
    if (!q) return null;
    const inPublishedTest = db.tests.some((t) => t.published && !t.deletedAt && t.questionIds.includes(q.id));
    return inPublishedTest ? { subjectSlug: q.subjectSlug } : null;
  },
};

/* ---------------- tests ---------------- */

const activeQuestions = (db: Db, t: TestRec): QuestionRec[] =>
  t.questionIds.flatMap((id) => db.questions.find((q) => q.id === id && !q.deletedAt && q.status === "published") ?? []);

function summary(db: Db, t: TestRec, userId?: string): TestSummary {
  const qs = activeQuestions(db, t);
  let bestScore: number | undefined;
  if (userId) {
    const scores = db.attempts.filter((a) => a.userId === userId && a.testId === t.id && a.result).map((a) => a.result!.scorePercent);
    if (scores.length) bestScore = Math.max(...scores);
  }
  return {
    id: t.id, subjectSlug: t.subjectSlug, topicId: t.topicId, title: t.title, questionCount: qs.length,
    totalPoints: qs.reduce((a, q) => a + q.points, 0), durationMinutes: t.durationMinutes, passMark: t.passMark,
    published: t.published, bestScore, archived: !!t.deletedAt,
  };
}

function studentVisible(db: Db, t: TestRec | undefined): t is TestRec {
  if (!t || t.deletedAt || !t.published) return false;
  if (!subjectVisible(db, db.subjects.find((s) => s.slug === t.subjectSlug))) return false;
  if (t.topicId && !topicVisible(db, db.topics.find((x) => x.id === t.topicId))) return false;
  return activeQuestions(db, t).length > 0;
}

function draftOf(a: AttemptRec) {
  return {
    testId: a.testId, answers: a.answers, flagged: a.flagged, currentIndex: a.currentIndex,
    elapsedSeconds: Math.max(0, Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 1000)),
  };
}

function cleanAnswers(db: Db, t: TestRec, answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of activeQuestions(db, t)) {
    const given = answers[q.id];
    if (given && q.options.some((o) => o.id === given)) out[q.id] = given;
  }
  return out;
}

/** Scores an attempt and freezes a snapshot (questions, answers, explanations) so later edits never rewrite history. */
function finalize(db: Db, a: AttemptRec, t: TestRec): TestResult {
  const qs = activeQuestions(db, t);
  const subject = db.subjects.find((s) => s.slug === t.subjectSlug);
  const before = subjectProgress(db, a.userId, t.subjectSlug).percent;
  const review: ReviewItem[] = qs.map((q) => {
    const selected = a.answers[q.id] ?? null;
    return {
      questionId: q.id, text: q.text, options: q.options, selectedOptionId: selected, correctOptionId: q.correctOptionId,
      explanation: q.explanation, isCorrect: selected === q.correctOptionId, flagged: a.flagged.includes(q.id), points: q.points,
    };
  });
  const correct = review.filter((r) => r.isCorrect).length;
  const unanswered = review.filter((r) => r.selectedOptionId === null).length;
  const totalPoints = review.reduce((s, r) => s + r.points, 0);
  const earnedPoints = review.filter((r) => r.isCorrect).reduce((s, r) => s + r.points, 0);
  const scorePercent = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = scorePercent >= t.passMark;
  const submittedAt = nowIso();

  if (passed && t.topicId && topicVisible(db, db.topics.find((x) => x.id === t.topicId))) {
    userProgress(db, a.userId).set(t.topicId, { percent: 100, updatedAt: submittedAt });
  }
  const after = subjectProgress(db, a.userId, t.subjectSlug).percent;

  return {
    attemptId: a.id, testId: t.id, testTitle: t.title, subjectSlug: t.subjectSlug, subjectName: subject?.name ?? t.subjectSlug,
    total: review.length, correct, incorrect: review.length - correct - unanswered, unanswered, earnedPoints, totalPoints,
    scorePercent, passMark: t.passMark, passed,
    timeSpentSeconds: Math.min(Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 1000), t.durationMinutes * 60),
    submittedAt, review, progressBefore: before, progressAfter: after,
  };
}

function complete(db: Db, a: AttemptRec, t: TestRec) {
  const result = finalize(db, a, t);
  a.status = "SUBMITTED";
  a.submittedAt = result.submittedAt;
  a.result = result;
  pushActivity(db, { userId: a.userId, kind: "test", title: t.title, context: result.subjectName, href: routes.testResult(t.id, a.id), detail: `${result.scorePercent}%` });
  pushNotification(db, a.userId, { code: "result_ready", params: { test: t.title }, target: { kind: "result", id: t.id, attemptId: a.id } });
}

/** An attempt whose deadline (+grace) has passed is closed automatically with the answers saved so far. */
function expireIfNeeded(db: Db, a: AttemptRec | undefined): AttemptRec | undefined {
  if (!a || a.status !== "IN_PROGRESS") return a;
  if (Date.now() > new Date(a.deadlineAt).getTime() + GRACE_MS) {
    const t = db.tests.find((x) => x.id === a.testId);
    if (t) complete(db, a, t);
  }
  return a;
}

const inProgress = (db: Db, userId: string, testId: string) =>
  db.attempts.find((a) => a.userId === userId && a.testId === testId && a.status === "IN_PROGRESS");

const toStart = (a: AttemptRec): AttemptStart => ({ attemptId: a.id, draft: draftOf(a), deadlineAt: a.deadlineAt });

export const testService: TestService = {
  async listForSubject(slug, userId) {
    const db = getDb();
    return db.tests.filter((t) => t.subjectSlug === slug && studentVisible(db, t)).map((t) => summary(db, t, userId));
  },
  async listPublished(userId) {
    const db = getDb();
    return db.tests.filter((t) => studentVisible(db, t)).map((t) => summary(db, t, userId));
  },
  async getSummary(testId) {
    const db = getDb();
    const t = db.tests.find((x) => x.id === testId);
    return studentVisible(db, t) ? summary(db, t) : null;
  },
  async getForAttempt(testId) {
    const db = getDb();
    const t = db.tests.find((x) => x.id === testId);
    if (!studentVisible(db, t)) return null;
    return {
      ...summary(db, t),
      // Correct answers and explanations are deliberately omitted here.
      questions: activeQuestions(db, t).map((q) => ({ id: q.id, text: q.text, options: q.options, points: q.points })),
    };
  },
  async getActiveAttempt(userId, testId) {
    const db = getDb();
    const a = expireIfNeeded(db, inProgress(db, userId, testId));
    return a && a.status === "IN_PROGRESS" ? toStart(a) : null;
  },
  async startAttempt(userId, testId) {
    const db = getDb();
    const t = db.tests.find((x) => x.id === testId);
    if (!studentVisible(db, t)) return { ok: false, code: "NOT_FOUND" };
    const existing = expireIfNeeded(db, inProgress(db, userId, testId));
    if (existing && existing.status === "IN_PROGRESS") return { ok: true, data: toStart(existing) };
    const startedAt = new Date();
    const a: AttemptRec = {
      id: newId("att"), userId, testId, status: "IN_PROGRESS", startedAt: startedAt.toISOString(),
      deadlineAt: new Date(startedAt.getTime() + t.durationMinutes * 60_000).toISOString(),
      answers: {}, flagged: [], currentIndex: 0, elapsedSeconds: 0,
    };
    db.attempts.push(a);
    return { ok: true, data: toStart(a) };
  },
  async saveDraft(userId, draft) {
    const db = getDb();
    const a = inProgress(db, userId, draft.testId);
    const t = db.tests.find((x) => x.id === draft.testId);
    if (!a || !t) return { ok: false, code: "NO_ATTEMPT" };
    if (Date.now() > new Date(a.deadlineAt).getTime() + GRACE_MS) return { ok: false, code: "EXPIRED" };
    a.answers = cleanAnswers(db, t, draft.answers);
    a.flagged = draft.flagged.filter((id) => t.questionIds.includes(id));
    a.currentIndex = Math.max(0, Math.min(draft.currentIndex, t.questionIds.length - 1));
    a.elapsedSeconds = draftOf(a).elapsedSeconds;
    return { ok: true, data: { savedAt: nowIso() } };
  },
  async submit({ userId, testId, answers, flagged }) {
    const db = getDb();
    const a = inProgress(db, userId, testId);
    const t = db.tests.find((x) => x.id === testId);
    if (!a || !t) return { ok: false, code: "NO_ATTEMPT" };
    // Within the grace window the submitted answers win; later than that only the saved draft counts.
    if (Date.now() <= new Date(a.deadlineAt).getTime() + GRACE_MS) {
      a.answers = cleanAnswers(db, t, answers);
      a.flagged = flagged.filter((id) => t.questionIds.includes(id));
    }
    complete(db, a, t);
    return { ok: true, data: { attemptId: a.id } };
  },
  async getResult(testId, userId, attemptId) {
    const db = getDb();
    const mine = db.attempts.filter((a) => a.userId === userId && a.testId === testId && a.status === "SUBMITTED" && a.result);
    if (attemptId) return mine.find((a) => a.id === attemptId)?.result ?? null;
    return mine.sort((x, y) => (y.submittedAt ?? "").localeCompare(x.submittedAt ?? ""))[0]?.result ?? null;
  },
  async listResults(userId, limit = 20): Promise<ResultListItem[]> {
    return getDb().attempts
      .filter((a) => a.userId === userId && a.status === "SUBMITTED" && a.result)
      .sort((x, y) => (y.submittedAt ?? "").localeCompare(x.submittedAt ?? ""))
      .slice(0, limit)
      .map((a) => ({
        attemptId: a.id, testId: a.testId, testTitle: a.result!.testTitle, subjectName: a.result!.subjectName,
        scorePercent: a.result!.scorePercent, passed: a.result!.passed, submittedAt: a.submittedAt!,
      }));
  },
  async listAllForAdmin() {
    const db = getDb();
    return db.tests.map((t) => ({ ...summary(db, t), questionIds: t.questionIds }));
  },
  async create(input) {
    const db = getDb();
    const bad = checkTest(db, input);
    if (bad) return bad;
    const rec: TestRec = {
      id: newId("test"), subjectSlug: input.subjectSlug, topicId: input.topicId || undefined, title: input.title.trim(),
      durationMinutes: input.durationMinutes, passMark: input.passMark, questionIds: input.questionIds, published: input.published, createdAt: nowIso(),
    };
    db.tests.push(rec);
    return { ok: true, data: { id: rec.id } };
  },
  async update(id, input) {
    const db = getDb();
    const rec = db.tests.find((t) => t.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    const bad = checkTest(db, input);
    if (bad) return bad;
    Object.assign(rec, {
      title: input.title.trim(), subjectSlug: input.subjectSlug, topicId: input.topicId || undefined,
      durationMinutes: input.durationMinutes, passMark: input.passMark, questionIds: input.questionIds, published: input.published,
    });
    return { ok: true, data: undefined };
  },
  async setArchived(id, archived) {
    const rec = getDb().tests.find((t) => t.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    rec.deletedAt = archived ? nowIso() : undefined;
    return { ok: true, data: undefined };
  },
};

function checkTest(db: Db, input: TestInput): Extract<ServiceResult, { ok: false }> | null {
  if (!db.subjects.some((s) => s.slug === input.subjectSlug && !s.deletedAt)) return { ok: false, code: "NOT_FOUND", field: "subject" };
  if (input.topicId) {
    const topic = db.topics.find((t) => t.id === input.topicId && !t.deletedAt);
    if (!topic || topic.subjectSlug !== input.subjectSlug) return { ok: false, code: "TOPIC_MISMATCH", field: "topic" };
  }
  const unique = [...new Set(input.questionIds)];
  if (unique.length === 0) return { ok: false, code: "QUESTIONS_REQUIRED", field: "questionIds" };
  const ok = unique.every((qid) => db.questions.some((q) => q.id === qid && !q.deletedAt && q.subjectSlug === input.subjectSlug));
  if (!ok) return { ok: false, code: "QUESTION_SUBJECT_MISMATCH", field: "questionIds" };
  input.questionIds = unique;
  return null;
}
