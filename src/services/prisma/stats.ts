import "server-only";
import type { StatsService } from "../contracts";
import type { AdminStats, PlatformSlug } from "@/types";
import { getPrisma } from "@/lib/prisma";
import { enrollmentActive, platformOfSubject, subjectProgress, subjectVisible, topicVisible } from "../domain/calc";
import { loadCalcDbForRead } from "./load";

const DAY = 86_400_000;
const startOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();
const endOf = (iso: string) => new Date(`${iso}T23:59:59.999Z`).getTime();
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Admin statistics over PostgreSQL. Every number is derived from real records (users, enrolments, attempts, material
 * completions, topic progress timestamps) — an empty range yields zeros / nulls, never made-up values.
 */
export const statsService: StatsService = {
  async getAdminStats(filter): Promise<AdminStats> {
    const prisma = getPrisma();
    const from = startOf(filter.from);
    const to = endOf(filter.to);
    const range = { gte: new Date(from), lte: new Date(to) };
    const calc = await loadCalcDbForRead("all");

    const subjects = calc.subjects.filter((s) => subjectVisible(calc, s) && (!filter.subjectSlug || s.slug === filter.subjectSlug) && (!filter.platform || platformOfSubject(calc, s) === filter.platform));
    const subjectSlugs = new Set(subjects.map((s) => s.slug));
    const platformsInScope = new Set<PlatformSlug>(subjects.map((s) => platformOfSubject(calc, s)));
    const topics = calc.topics.filter((t) => subjectSlugs.has(t.subjectSlug) && topicVisible(calc, t));
    const topicIds = topics.map((t) => t.id);
    const materialRows = await prisma.material.findMany({ where: { deletedAt: null, subjectSlug: { in: [...subjectSlugs] } }, select: { id: true } });
    const tests = await prisma.test.findMany({ where: { deletedAt: null, kind: "topic_test", subjectSlug: { in: [...subjectSlugs] } }, select: { id: true, title: true, subjectSlug: true } });

    // Students in scope: every student account; with a platform / subject filter only those enrolled in the platform(s).
    const scoped = !!(filter.platform || filter.subjectSlug);
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT", deletedAt: null,
        ...(scoped ? { enrollments: { some: { platformSlug: { in: [...platformsInScope] }, status: { in: ["FREE", "ACTIVE"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } : {}),
      },
      select: { id: true },
    });
    const studentIds = students.map((u) => u.id);

    const platformList = [...platformsInScope];
    const [newEnrollments, certificates, paidRows] = await Promise.all([
      prisma.enrollment.count({ where: { platformSlug: { in: platformList }, userId: { in: studentIds }, createdAt: range } }),
      prisma.certificate.count({ where: { status: "issued", subjectSlug: { in: [...subjectSlugs] }, userId: { in: studentIds }, issuedAt: range } }),
      prisma.payment.aggregate({ where: { status: "PAID", platformSlug: { in: platformList }, userId: { in: studentIds }, paidAt: range }, _count: { _all: true }, _sum: { amountCents: true } }),
    ]);
    const [attemptRows, completedRows, topicRows] = await Promise.all([
      prisma.testAttempt.findMany({
        where: { status: "SUBMITTED", submittedAt: range, userId: { in: studentIds }, testId: { in: tests.map((t) => t.id) } },
        select: { userId: true, testId: true, submittedAt: true, scorePercent: true, passed: true },
      }),
      prisma.materialProgress.findMany({ where: { completedAt: range, userId: { in: studentIds }, materialId: { in: materialRows.map((m) => m.id) } }, select: { userId: true, completedAt: true } }),
      prisma.topicProgress.findMany({ where: { updatedAt: range, userId: { in: studentIds }, topicId: { in: topicIds } }, select: { userId: true, updatedAt: true, topicId: true, percent: true } }),
    ]);

    type Event = { userId: string; at: number; kind: "attempt" | "material" | "topic" };
    const events: Event[] = [
      ...attemptRows.map((a) => ({ userId: a.userId, at: a.submittedAt!.getTime(), kind: "attempt" as const })),
      ...completedRows.map((m) => ({ userId: m.userId, at: m.completedAt.getTime(), kind: "material" as const })),
      ...topicRows.map((p) => ({ userId: p.userId, at: p.updatedAt.getTime(), kind: "topic" as const })),
    ];

    const scores = attemptRows.map((a) => a.scorePercent ?? 0);
    const passed = attemptRows.filter((a) => a.passed).length;

    // Buckets: days for ranges up to 45 days, otherwise months (UTC).
    const spanDays = Math.max(1, Math.round((to - from) / DAY));
    const bucket: "day" | "month" = spanDays <= 45 ? "day" : "month";
    const keyOf = (ms: number) => (bucket === "day" ? dayKey(ms) : dayKey(ms).slice(0, 7));
    const keys: string[] = [];
    for (let t = from; t <= to; t += DAY) { const k = keyOf(t); if (keys[keys.length - 1] !== k) keys.push(k); }
    const activity = keys.map((key) => {
      const inBucket = events.filter((e) => keyOf(e.at) === key);
      return {
        key, label: key,
        activeStudents: new Set(inBucket.map((e) => e.userId)).size,
        attempts: inBucket.filter((e) => e.kind === "attempt").length,
        completedMaterials: inBucket.filter((e) => e.kind === "material").length,
      };
    });

    const testPerformance = tests
      .map((t) => {
        const mine = attemptRows.filter((a) => a.testId === t.id);
        const subject = calc.subjects.find((s) => s.slug === t.subjectSlug);
        return {
          testId: t.id, title: t.title, subjectCode: subject?.code ?? t.subjectSlug, attempts: mine.length,
          avgScore: mine.length ? Math.round(mine.reduce((s, a) => s + (a.scorePercent ?? 0), 0) / mine.length) : 0,
          passRate: mine.length ? Math.round((mine.filter((a) => a.passed).length / mine.length) * 100) : 0,
        };
      })
      .filter((t) => t.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts);

    const enrolledByPlatform = new Map<PlatformSlug, string[]>();
    for (const e of calc.enrollments) {
      if (!enrollmentActive(e) || !studentIds.includes(e.userId)) continue;
      enrolledByPlatform.set(e.platform, [...(enrolledByPlatform.get(e.platform) ?? []), e.userId]);
    }
    const subjectRows = subjects
      .map((s) => {
        const platform = platformOfSubject(calc, s);
        const enrolled = enrolledByPlatform.get(platform) ?? [];
        const avg = enrolled.length ? Math.round(enrolled.reduce((sum, uid) => sum + subjectProgress(calc, uid, s.slug).percent, 0) / enrolled.length) : 0;
        return { subjectSlug: s.slug, code: s.code, name: s.name, platform, students: enrolled.length, avgProgress: avg };
      })
      .filter((s) => s.students > 0)
      .sort((a, b) => b.avgProgress - a.avgProgress || a.code.localeCompare(b.code));

    return {
      filter,
      totals: {
        students: students.length,
        activeStudents: new Set(events.map((e) => e.userId)).size,
        subjects: subjects.length, topics: topics.length, materials: materialRows.length, tests: tests.length,
        attempts: attemptRows.length,
        passRate: attemptRows.length ? Math.round((passed / attemptRows.length) * 100) : null,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        completedMaterials: completedRows.length,
        enrollments: newEnrollments, completedTopics: topicRows.filter((p) => p.percent >= 100).length, certificates, payments: paidRows._count._all, revenueCents: paidRows._sum.amountCents ?? 0,
      },
      activity, activityBucket: bucket, testPerformance, subjectProgress: subjectRows,
      passFail: { passed, failed: attemptRows.length - passed },
    };
  },
};
