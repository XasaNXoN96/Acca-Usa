import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { CalcDb, PlatformRec, LevelRec, ProgressEntry, SubjectRec, TopicRec } from "../domain/records";
import type { PlatformSlug } from "@/types";

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

export const toPlatformRec = (p: Prisma.PlatformGetPayload<object>): PlatformRec => ({ slug: p.slug as PlatformSlug, name: p.name, fullName: p.fullName, priceCents: p.priceCents, deletedAt: iso(p.deletedAt) });
export const toLevelRec = (l: Prisma.LevelGetPayload<object>): LevelRec => ({ id: l.id, platform: l.platformSlug as PlatformSlug, name: l.name, order: l.order });
export const toSubjectRec = (s: Prisma.SubjectGetPayload<object>): SubjectRec => ({ slug: s.slug, code: s.code, name: s.name, levelId: s.levelId, createdAt: s.createdAt.toISOString(), deletedAt: iso(s.deletedAt) });
export const toTopicRec = (t: Prisma.TopicGetPayload<object>): TopicRec => ({
  id: t.id, subjectSlug: t.subjectSlug, order: t.order, title: t.title, description: t.description, keyPoints: t.keyPoints,
  lessonCount: t.lessonCount, durationMinutes: t.durationMinutes, createdAt: t.createdAt.toISOString(), deletedAt: iso(t.deletedAt),
});

/**
 * Loads the data the pure progress rules (domain/calc.ts) need, as a CalcDb snapshot.
 *  • catalogue tables (platforms, levels, subjects, topics, material / test / question stubs) — small, indexed
 *  • learning state only for `userIds` (or everybody when `"all"` — admin lists, ranking, statistics)
 * The same functions that power the demo provider then compute progress, unlocking and certificates.
 */
export async function loadCalcDb(userIds: string[] | "all"): Promise<CalcDb> {
  const prisma = getPrisma();
  const byUser = userIds === "all" ? {} : { userId: { in: userIds } };
  const [platforms, levels, subjects, topics, materials, questions, tests, enrollments, topicProgress, materialProgress, attempts] = await Promise.all([
    prisma.platform.findMany(),
    prisma.level.findMany(),
    prisma.subject.findMany(),
    prisma.topic.findMany(),
    prisma.material.findMany({ select: { id: true, topicId: true, deletedAt: true } }),
    prisma.question.findMany({ select: { id: true, status: true, deletedAt: true } }),
    prisma.test.findMany({ select: { id: true, topicId: true, published: true, deletedAt: true, questions: { select: { questionId: true }, orderBy: { position: "asc" } } } }),
    prisma.enrollment.findMany({ where: byUser, select: { userId: true, platformSlug: true, status: true, expiresAt: true } }),
    prisma.topicProgress.findMany({ where: byUser }),
    prisma.materialProgress.findMany({ where: byUser, select: { userId: true, materialId: true } }),
    prisma.testAttempt.findMany({ where: { ...byUser, status: "SUBMITTED" }, select: { userId: true, testId: true, scorePercent: true, passed: true } }),
  ]);
  const progress = new Map<string, Map<string, ProgressEntry>>();
  for (const r of topicProgress) {
    let m = progress.get(r.userId);
    if (!m) progress.set(r.userId, (m = new Map()));
    m.set(r.topicId, { percent: r.percent, updatedAt: r.updatedAt.toISOString() });
  }
  return {
    platforms: platforms.map(toPlatformRec),
    levels: levels.map(toLevelRec),
    subjects: subjects.map(toSubjectRec),
    topics: topics.map(toTopicRec),
    materials: materials.map((m) => ({ id: m.id, topicId: m.topicId ?? undefined, deletedAt: iso(m.deletedAt) })),
    questions: questions.map((q) => ({ id: q.id, status: q.status, deletedAt: iso(q.deletedAt) })),
    tests: tests.map((t) => ({ id: t.id, topicId: t.topicId ?? undefined, published: t.published, deletedAt: iso(t.deletedAt), questionIds: t.questions.map((x) => x.questionId) })),
    enrollments: enrollments.map((e) => ({ userId: e.userId, platform: e.platformSlug as PlatformSlug, status: e.status, expiresAt: iso(e.expiresAt) })),
    progress,
    materialProgress,
    attempts: attempts.map((a) => ({ userId: a.userId, testId: a.testId, result: a.scorePercent === null ? undefined : { scorePercent: a.scorePercent, passed: !!a.passed } })),
  };
}

const loadMemoized = cache((key: string) => loadCalcDb(key === "*" ? "all" : key.split(",")));

/**
 * READ-ONLY variant memoised for the lifetime of one request (React `cache`): a page that asks several services for
 * progress (dashboard, ranking, certificates…) loads the data once. Never use it on a write path — a write followed by a
 * memoised read in the same request would see the old state; writers call `loadCalcDb` directly.
 */
export const loadCalcDbForRead = (userIds: string[] | "all") => loadMemoized(userIds === "all" ? "*" : [...userIds].sort().join(","));
