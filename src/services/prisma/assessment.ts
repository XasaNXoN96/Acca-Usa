import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AttemptStart, QuestionInput, QuestionService, ServiceResult, TestInput, TestResultService, TestService } from "../contracts";
import type { BankQuestion, PlatformSlug, QuestionOption, ResultListItem, ReviewItem, TestResult, TestSummary } from "@/types";
import { routes } from "@/lib/routes";
import { getPrisma } from "@/lib/prisma";
import { getStorage } from "../storage";
import { subjectProgress } from "../domain/calc";
import { applyReviewPolicy, attemptDeadline, startBlock, windowInvalid } from "../domain/exams";
import { issueIfEarned } from "./certs-core";
import { notifyAdmins, notifyEnrolled, notifyUser, recordActivity } from "./events";
import { loadCalcDb } from "./load";

const GRACE_MS = 60_000;
const LETTERS = ["a", "b", "c", "d"] as const;
const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const err = (code: string, field?: string) => ({ ok: false as const, code, field });
const ok = <T>(data: T) => ({ ok: true as const, data });

/* ---------------- question bank ---------------- */

type QuestionRow = Prisma.QuestionGetPayload<object>;
const optionsOf = (q: QuestionRow) => q.options as unknown as QuestionOption[];

const toBank = (q: QuestionRow): BankQuestion => ({
  id: q.id, subjectSlug: q.subjectSlug, topicId: q.topicId ?? undefined, tags: q.tags, imageId: q.imageId ?? undefined, text: q.text,
  options: optionsOf(q), correctOptionId: q.correctOptionId, explanation: q.explanation, points: q.points, difficulty: q.difficulty,
  status: q.deletedAt ? "archived" : q.status, archived: !!q.deletedAt, createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
});

const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 10);

async function checkSubjectAndTopic(subjectSlug: string, topicId?: string) {
  const prisma = getPrisma();
  if (!(await prisma.subject.findFirst({ where: { slug: subjectSlug, deletedAt: null } }))) return err("NOT_FOUND", "subject");
  if (topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: topicId, deletedAt: null } });
    if (!topic || topic.subjectSlug !== subjectSlug) return err("TOPIC_MISMATCH", "topic");
  }
  return null;
}

const questionData = (input: QuestionInput) => ({
  subjectSlug: input.subjectSlug, topicId: input.topicId || null, text: input.text.trim(),
  options: input.options.map((text, i) => ({ id: LETTERS[i]!, text: text.trim() })) as Prisma.InputJsonValue,
  correctOptionId: LETTERS[input.correctIndex]!, explanation: input.explanation.trim(), points: input.points, difficulty: input.difficulty,
  tags: cleanTags(input.tags), imageId: input.imageId || null, status: input.status,
});

export const questionService: QuestionService = {
  async list() {
    return (await getPrisma().question.findMany({ orderBy: { createdAt: "asc" } })).map(toBank);
  },
  async create(input) {
    const bad = await checkSubjectAndTopic(input.subjectSlug, input.topicId);
    if (bad) return bad;
    const rec = await getPrisma().question.create({ data: { id: newId("q"), ...questionData(input) } });
    if (rec.imageId) await getStorage().markAttached(rec.imageId, true);
    return ok({ id: rec.id });
  },
  async update(id, input) {
    const prisma = getPrisma();
    const rec = await prisma.question.findUnique({ where: { id } });
    if (!rec) return err("NOT_FOUND");
    const bad = await checkSubjectAndTopic(input.subjectSlug, input.topicId);
    if (bad) return bad;
    const nextImage = input.imageId || null;
    if (rec.imageId && rec.imageId !== nextImage) await getStorage().delete(rec.imageId);
    if (nextImage && nextImage !== rec.imageId) await getStorage().markAttached(nextImage, true);
    await prisma.question.update({ where: { id }, data: questionData(input) });
    return ok(undefined);
  },
  async setArchived(id, archived) {
    const r = await getPrisma().question.updateMany({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
    return r.count ? ok(undefined) : err("NOT_FOUND");
  },
  async imageAccess(fileId) {
    const q = await getPrisma().question.findFirst({
      // an illustration of an exam is served only while that exam is open (a scheduled or closed exam must not leak its content)
      where: {
        imageId: fileId, deletedAt: null, status: "published",
        tests: { some: { test: { published: true, deletedAt: null, OR: [{ kind: "topic_test" }, { kind: "exam", AND: [{ OR: [{ opensAt: null }, { opensAt: { lte: new Date() } }] }, { OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] }] }] } } },
      },
      select: { subjectSlug: true },
    });
    return q ? { subjectSlug: q.subjectSlug } : null;
  },
};

/* ---------------- tests ---------------- */

const testInclude = {
  questions: { orderBy: { position: "asc" }, include: { question: true } },
} satisfies Prisma.TestInclude;
type TestRow = Prisma.TestGetPayload<{ include: typeof testInclude }>;

const activeQuestions = (t: TestRow): QuestionRow[] =>
  t.questions.map((x) => x.question).filter((q) => !q.deletedAt && q.status === "published");

const studentVisibleWhere: Prisma.TestWhereInput = {
  kind: "topic_test",
  published: true, deletedAt: null, subject: { deletedAt: null, level: { platform: { deletedAt: null } } },
  OR: [{ topicId: null }, { topic: { deletedAt: null } }],
};
const hasQuestions = (t: TestRow) => activeQuestions(t).length > 0;

interface UserTestStats { attemptsUsed: number; bestScore?: number }
async function statsFor(userId: string | undefined, testIds: string[]): Promise<Map<string, UserTestStats>> {
  const out = new Map<string, UserTestStats>();
  if (!userId || !testIds.length) return out;
  const rows = await getPrisma().testAttempt.groupBy({
    by: ["testId"], where: { userId, testId: { in: testIds }, status: "SUBMITTED" }, _count: { _all: true }, _max: { scorePercent: true },
  });
  for (const r of rows) out.set(r.testId, { attemptsUsed: r._count._all, bestScore: r._max.scorePercent ?? undefined });
  return out;
}

function summary(t: TestRow, stats?: UserTestStats): TestSummary {
  const qs = activeQuestions(t);
  return {
    id: t.id, subjectSlug: t.subjectSlug, topicId: t.topicId ?? undefined, title: t.title, description: t.description, questionCount: qs.length,
    totalPoints: qs.reduce((a, q) => a + q.points, 0), durationMinutes: t.durationMinutes, passMark: t.passMark,
    attemptsAllowed: t.attemptsAllowed, attemptsUsed: stats?.attemptsUsed, randomizeQuestions: t.randomizeQuestions, randomizeAnswers: t.randomizeAnswers,
    published: t.published, publishedAt: t.publishedAt?.toISOString(), bestScore: stats?.bestScore, archived: !!t.deletedAt,
    kind: t.kind, opensAt: t.opensAt?.toISOString(), closesAt: t.closesAt?.toISOString(), reviewPolicy: t.reviewPolicy,
  };
}

async function summaries(rows: TestRow[], userId?: string): Promise<TestSummary[]> {
  const stats = await statsFor(userId, rows.map((t) => t.id));
  return rows.map((t) => summary(t, userId ? (stats.get(t.id) ?? { attemptsUsed: 0 }) : undefined));
}

/** Deterministic per-attempt shuffle (mulberry32 seeded from the attempt id) so a page reload never reorders the test. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

interface ShownQuestion { id: string; text: string; options: QuestionOption[]; correctOptionId: string; explanation: string; points: number; imageId?: string }
function questionsFor(t: TestRow, attemptId?: string): ShownQuestion[] {
  let qs = activeQuestions(t);
  if (attemptId && t.randomizeQuestions) qs = seededShuffle(qs, `${attemptId}:q`);
  return qs.map((q) => ({
    id: q.id, text: q.text, correctOptionId: q.correctOptionId, explanation: q.explanation, points: q.points, imageId: q.imageId ?? undefined,
    options: attemptId && t.randomizeAnswers ? seededShuffle(optionsOf(q), `${attemptId}:${q.id}`) : optionsOf(q),
  }));
}

const loadTest = (id: string, extra: Prisma.TestWhereInput = {}) => getPrisma().test.findFirst({ where: { id, ...extra }, include: testInclude });
/** Topic tests and exams alike: published, non-archived, visible subject / topic, at least one published question. */
const loadVisibleTest = async (id: string) => {
  const { kind: _kind, ...anyKind } = studentVisibleWhere;
  const t = await loadTest(id, anyKind);
  return t && hasQuestions(t) ? t : null;
};

type AttemptRow = Prisma.TestAttemptGetPayload<object>;
const answersOf = (a: AttemptRow) => (a.answers ?? {}) as Record<string, string>;
const flaggedOf = (a: AttemptRow) => (a.flagged ?? []) as string[];

function draftOf(a: AttemptRow) {
  return {
    testId: a.testId, answers: answersOf(a), flagged: flaggedOf(a), currentIndex: a.currentIndex,
    elapsedSeconds: Math.max(0, Math.floor((Date.now() - a.startedAt.getTime()) / 1000)),
  };
}
const toStart = (a: AttemptRow): AttemptStart => ({ attemptId: a.id, draft: draftOf(a), deadlineAt: a.deadlineAt.toISOString() });

function cleanAnswers(t: TestRow, answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of activeQuestions(t)) {
    const given = answers[q.id];
    if (given && optionsOf(q).some((o) => o.id === given)) out[q.id] = given;
  }
  return out;
}

const findInProgress = (userId: string, testId: string) =>
  getPrisma().testAttempt.findFirst({ where: { userId, testId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } });

/**
 * Scores an attempt, freezes the result snapshot (questions, answers, explanations) and applies the side effects once.
 * The IN_PROGRESS → SUBMITTED transition is a conditional update, so concurrent submits / expiry cannot score twice.
 */
async function complete(a: AttemptRow, t: TestRow, answers: Record<string, string>, flagged: string[]): Promise<TestResult | null> {
  const prisma = getPrisma();
  const before = subjectProgress(await loadCalcDb([a.userId]), a.userId, t.subjectSlug).percent;
  const qs = questionsFor(t, a.id);
  const review: ReviewItem[] = qs.map((q) => {
    const selected = answers[q.id] ?? null;
    return {
      questionId: q.id, text: q.text, options: q.options, selectedOptionId: selected, correctOptionId: q.correctOptionId,
      explanation: q.explanation, isCorrect: selected === q.correctOptionId, flagged: flagged.includes(q.id), points: q.points,
    };
  });
  const correct = review.filter((r) => r.isCorrect).length;
  const unanswered = review.filter((r) => r.selectedOptionId === null).length;
  const totalPoints = review.reduce((s, r) => s + r.points, 0);
  const earnedPoints = review.filter((r) => r.isCorrect).reduce((s, r) => s + r.points, 0);
  const scorePercent = totalPoints ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = scorePercent >= t.passMark;
  const submittedAt = new Date();
  const timeSpentSeconds = Math.min(Math.floor((submittedAt.getTime() - a.startedAt.getTime()) / 1000), t.durationMinutes * 60);
  const subject = await prisma.subject.findUnique({ where: { slug: t.subjectSlug } });

  const result: TestResult = {
    attemptId: a.id, testId: t.id, testTitle: t.title, subjectSlug: t.subjectSlug, subjectName: subject?.name ?? t.subjectSlug,
    total: review.length, correct, incorrect: review.length - correct - unanswered, unanswered, earnedPoints, totalPoints,
    scorePercent, passMark: t.passMark, passed, timeSpentSeconds, submittedAt: submittedAt.toISOString(), review,
    progressBefore: before, progressAfter: before,
  };
  const claimed = await prisma.testAttempt.updateMany({
    where: { id: a.id, status: "IN_PROGRESS" },
    data: {
      status: "SUBMITTED", submittedAt, answers, flagged, scorePercent, passed, timeSpentSeconds,
      result: result as unknown as Prisma.InputJsonValue,
    },
  });
  if (claimed.count !== 1) return null; // somebody else finished it first

  if (passed && t.topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: t.topicId, deletedAt: null, subject: { deletedAt: null, level: { platform: { deletedAt: null } } } } });
    if (topic) {
      await prisma.topicProgress.upsert({
        where: { userId_topicId: { userId: a.userId, topicId: topic.id } }, create: { userId: a.userId, topicId: topic.id, percent: 100 }, update: { percent: 100 },
      });
      await issueIfEarned(a.userId, t.subjectSlug);
    }
  }
  result.progressAfter = subjectProgress(await loadCalcDb([a.userId]), a.userId, t.subjectSlug).percent; // includes this attempt's score
  await prisma.testAttempt.update({ where: { id: a.id }, data: { result: result as unknown as Prisma.InputJsonValue } });

  await recordActivity({ userId: a.userId, kind: "test", title: t.title, context: result.subjectName, href: routes.testResult(t.id, a.id), detail: `${scorePercent}%` });
  await notifyUser(a.userId, { code: "result_ready", params: { test: t.title }, target: { kind: "result", id: t.id, attemptId: a.id } });
  const student = await prisma.user.findUnique({ where: { id: a.userId }, select: { name: true } });
  await notifyAdmins({ code: "test_submitted", params: { student: student?.name ?? "—", test: t.title, score: String(scorePercent) }, target: { kind: "admin", path: "/admin/statistics" } });
  return result;
}

/** An attempt whose deadline (+grace) has passed is closed automatically with the answers saved so far. */
async function expireIfNeeded(a: AttemptRow | null): Promise<AttemptRow | null> {
  if (!a || a.status !== "IN_PROGRESS") return a;
  if (Date.now() <= a.deadlineAt.getTime() + GRACE_MS) return a;
  const t = await loadTest(a.testId);
  if (!t) return a;
  const done = await complete(a, t, answersOf(a), flaggedOf(a));
  if (done) await notifyAdmins({ code: "system_event", params: { event: "attempt_expired", detail: t.title }, target: { kind: "admin", path: "/admin/statistics" } });
  return getPrisma().testAttempt.findUnique({ where: { id: a.id } });
}

const resultOf = (a: AttemptRow) => (a.result ?? null) as unknown as TestResult | null;
const toListItem = (a: AttemptRow): ResultListItem | null => {
  const r = resultOf(a);
  return r ? { attemptId: a.id, testId: a.testId, testTitle: r.testTitle, subjectName: r.subjectName, scorePercent: r.scorePercent, passed: r.passed, submittedAt: a.submittedAt!.toISOString() } : null;
};
const submittedOf = (userId: string, where: Prisma.TestAttemptWhereInput = {}) => ({ where: { userId, status: "SUBMITTED" as const, ...where }, orderBy: { submittedAt: "desc" as const } });

async function announceTest(t: { id: string; title: string; subjectSlug: string }) {
  const subject = await getPrisma().subject.findUnique({ where: { slug: t.subjectSlug }, include: { level: true } });
  if (subject) await notifyEnrolled(subject.level.platformSlug as PlatformSlug, { code: "test_published", params: { test: t.title, subject: subject.code }, target: { kind: "test", id: t.id } });
}

async function checkTest(input: TestInput) {
  if (input.kind === "exam" && windowInvalid(input.opensAt, input.closesAt)) return err("WINDOW_INVALID", "closesAt");
  const bad = await checkSubjectAndTopic(input.subjectSlug, input.kind === "exam" ? undefined : input.topicId);
  if (bad) return bad;
  const unique = [...new Set(input.questionIds)];
  if (unique.length === 0) return err("QUESTIONS_REQUIRED", "questionIds");
  const count = await getPrisma().question.count({ where: { id: { in: unique }, deletedAt: null, status: "published", subjectSlug: input.subjectSlug } });
  if (count !== unique.length) return err("QUESTION_SUBJECT_MISMATCH", "questionIds");
  input.questionIds = unique;
  return null;
}

const testData = (input: TestInput, exam: boolean) => ({
  title: input.title.trim(), description: input.description.trim(), subjectSlug: input.subjectSlug, topicId: exam ? null : input.topicId || null,
  durationMinutes: input.durationMinutes, passMark: input.passMark, attemptsAllowed: input.attemptsAllowed,
  randomizeQuestions: input.randomizeQuestions, randomizeAnswers: input.randomizeAnswers,
  ...(exam ? { opensAt: input.opensAt ? new Date(input.opensAt) : null, closesAt: input.closesAt ? new Date(input.closesAt) : null, reviewPolicy: input.reviewPolicy ?? "IMMEDIATE" } : {}),
});
const questionLinks = (ids: string[]) => ids.map((questionId, position) => ({ questionId, position }));

export const testService: TestService = {
  async listForSubject(slug, userId) {
    const rows = await getPrisma().test.findMany({ where: { subjectSlug: slug, ...studentVisibleWhere }, include: testInclude, orderBy: { createdAt: "asc" } });
    return summaries(rows.filter(hasQuestions), userId);
  },
  async listPublished(userId) {
    const rows = await getPrisma().test.findMany({ where: studentVisibleWhere, include: testInclude, orderBy: { createdAt: "asc" } });
    return summaries(rows.filter(hasQuestions), userId);
  },
  async getSummary(testId, userId) {
    const t = await loadVisibleTest(testId);
    return t ? (await summaries([t], userId))[0]! : null;
  },
  async getForAttempt(testId, userId) {
    const t = await loadVisibleTest(testId);
    if (!t) return null;
    const active = userId ? await findInProgress(userId, testId) : null;
    const [head] = await summaries([t], userId);
    return {
      ...head!,
      // Correct answers and explanations are deliberately omitted here.
      questions: questionsFor(t, active?.id).map((q) => ({ id: q.id, text: q.text, options: q.options, points: q.points, imageId: q.imageId })),
    };
  },
  async getActiveAttempt(userId, testId) {
    const a = await expireIfNeeded(await findInProgress(userId, testId));
    return a && a.status === "IN_PROGRESS" ? toStart(a) : null;
  },
  async startAttempt(userId, testId) {
    const prisma = getPrisma();
    const t = await loadVisibleTest(testId);
    if (!t) return err("NOT_FOUND");
    const existing = await expireIfNeeded(await findInProgress(userId, testId));
    if (existing && existing.status === "IN_PROGRESS") return ok(toStart(existing));
    // Exams run inside their availability window, and never past its end (server clock, not the browser's).
    const blocked = startBlock({ kind: t.kind, opensAt: t.opensAt?.toISOString(), closesAt: t.closesAt?.toISOString() });
    if (blocked) return err(blocked);
    // Serialise starts of the same learner and test: simultaneous requests must not create several attempts (that would
    // let one learner exceed the attempt limit). The transaction-scoped advisory lock is released at commit.
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attempt:${userId}:${testId}`}))`;
      const live = await tx.testAttempt.findFirst({ where: { userId, testId, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" } });
      if (live) return ok(toStart(live));
      if (t.attemptsAllowed > 0 && (await tx.testAttempt.count({ where: { userId, testId, status: "SUBMITTED" } })) >= t.attemptsAllowed) return err("ATTEMPTS_EXHAUSTED");
      const startedAt = new Date();
      const deadlineAt = new Date(attemptDeadline({ kind: t.kind, closesAt: t.closesAt?.toISOString() }, startedAt.getTime(), t.durationMinutes));
      const a = await tx.testAttempt.create({ data: { id: newId("att"), userId, testId, startedAt, deadlineAt } });
      return ok(toStart(a));
    });
  },
  async saveDraft(userId, draft) {
    const a = await findInProgress(userId, draft.testId);
    const t = await loadTest(draft.testId);
    if (!a || !t) return err("NO_ATTEMPT");
    if (Date.now() > a.deadlineAt.getTime() + GRACE_MS) return err("EXPIRED");
    const ids = t.questions.map((x) => x.questionId);
    const saved = await getPrisma().testAttempt.updateMany({
      where: { id: a.id, status: "IN_PROGRESS" },
      data: { answers: cleanAnswers(t, draft.answers), flagged: draft.flagged.filter((id) => ids.includes(id)), currentIndex: Math.max(0, Math.min(draft.currentIndex, ids.length - 1)) },
    });
    return saved.count ? ok({ savedAt: new Date().toISOString() }) : err("NO_ATTEMPT");
  },
  async submit({ userId, testId, answers, flagged }) {
    const a = await findInProgress(userId, testId);
    const t = await loadTest(testId);
    if (!a || !t) return err("NO_ATTEMPT");
    const ids = t.questions.map((x) => x.questionId);
    // Within the grace window the submitted answers win; later than that only the saved draft counts.
    const inTime = Date.now() <= a.deadlineAt.getTime() + GRACE_MS;
    const finalAnswers = inTime ? cleanAnswers(t, answers) : answersOf(a);
    const finalFlags = inTime ? flagged.filter((id) => ids.includes(id)) : flaggedOf(a);
    await complete(a, t, finalAnswers, finalFlags);
    return ok({ attemptId: a.id });
  },
  async getResult(testId, userId, attemptId) {
    const a = await getPrisma().testAttempt.findFirst(submittedOf(userId, attemptId ? { testId, id: attemptId } : { testId }));
    const result = a ? resultOf(a) : null;
    if (!result) return null;
    const t = await getPrisma().test.findUnique({ where: { id: testId }, select: { kind: true, opensAt: true, closesAt: true, reviewPolicy: true } });
    return applyReviewPolicy(result, t ? { kind: t.kind, closesAt: t.closesAt?.toISOString(), reviewPolicy: t.reviewPolicy } : undefined); // the stored result stays untouched
  },
  async listResults(userId, limit = 20) {
    const rows = await getPrisma().testAttempt.findMany({ ...submittedOf(userId), take: limit });
    return rows.flatMap((a) => toListItem(a) ?? []);
  },
  async listAllForAdmin(kind = "topic_test") {
    const rows = await getPrisma().test.findMany({ where: { kind }, include: testInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return (await summaries(rows)).map((s, i) => ({ ...s, questionIds: rows[i]!.questions.map((x) => x.questionId) }));
  },
  async create(input) {
    const bad = await checkTest(input);
    if (bad) return bad;
    const t = await getPrisma().test.create({
      data: { id: newId("test"), ...testData(input, input.kind === "exam"), ...(input.kind === "exam" ? { kind: "exam" as const } : {}), published: input.published, publishedAt: input.published ? new Date() : null, questions: { create: questionLinks(input.questionIds) } },
    });
    if (t.published) await announceTest(t);
    return ok({ id: t.id });
  },
  async update(id, input) {
    const prisma = getPrisma();
    const rec = await prisma.test.findUnique({ where: { id } });
    if (!rec) return err("NOT_FOUND");
    const bad = await checkTest(input);
    if (bad) return bad;
    const next = await prisma.$transaction(async (tx) => {
      await tx.testQuestion.deleteMany({ where: { testId: id } });
      return tx.test.update({
        where: { id },
        data: { ...testData(input, rec.kind === "exam"), published: input.published, publishedAt: input.published ? (rec.publishedAt ?? new Date()) : rec.publishedAt, questions: { create: questionLinks(input.questionIds) } },
      });
    });
    if (next.published && !rec.published) await announceTest(next);
    return ok(undefined);
  },
  async setArchived(id, archived) {
    const r = await getPrisma().test.updateMany({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
    return r.count ? ok(undefined) : err("NOT_FOUND");
  },
  async setPublished(id, published) {
    const t = await loadTest(id, { deletedAt: null });
    if (!t) return err("NOT_FOUND");
    if (published && activeQuestions(t).length === 0) return err("QUESTIONS_REQUIRED", "questionIds");
    await getPrisma().test.update({ where: { id }, data: { published, ...(published ? { publishedAt: new Date() } : {}) } });
    if (published && !t.published) await announceTest(t);
    return ok(undefined);
  },
  async duplicate(id) {
    const t = await loadTest(id);
    if (!t) return err("NOT_FOUND");
    const copy = await getPrisma().test.create({
      data: {
        id: newId("test"), subjectSlug: t.subjectSlug, topicId: t.topicId, kind: t.kind, title: `${t.title} (copy)`.slice(0, 160), description: t.description,
        durationMinutes: t.durationMinutes, passMark: t.passMark, attemptsAllowed: t.attemptsAllowed, randomizeQuestions: t.randomizeQuestions,
        randomizeAnswers: t.randomizeAnswers, published: false, opensAt: t.opensAt, closesAt: t.closesAt, reviewPolicy: t.reviewPolicy,
        questions: { create: questionLinks(t.questions.map((x) => x.questionId)) },
      },
    });
    return ok({ id: copy.id });
  },
};

/** Student-facing results: kept apart from TestService so a database-backed implementation can own them. */
export const testResultService: TestResultService = {
  get: (testId, userId, attemptId) => testService.getResult(testId, userId, attemptId),
  list: (userId, limit) => testService.listResults(userId, limit),
  async attemptsForTest(userId, testId) {
    const rows = await getPrisma().testAttempt.findMany(submittedOf(userId, { testId }));
    return rows.flatMap((a) => toListItem(a) ?? []);
  },
};

export type { ServiceResult };
