import "server-only";
import type { StatsService } from "../contracts";
import type { AdminStats, PlatformSlug } from "@/types";
import { getDb, platformOfSubject, subjectVisible, topicVisible } from "./db";
import { subjectProgress } from "./calc";

const DAY = 86_400_000;
const startOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getTime();
const endOf = (iso: string) => new Date(`${iso}T23:59:59.999Z`).getTime();
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Admin statistics over the demo database. Every number is derived from real records (users, enrolments, attempts,
 * material completions, topic progress timestamps) — an empty range yields zeros / nulls, never made-up values.
 * A Prisma implementation will run the same aggregates as SQL.
 */
export const statsService: StatsService = {
  async getAdminStats(filter): Promise<AdminStats> {
    const db = getDb();
    const from = startOf(filter.from);
    const to = endOf(filter.to);
    const inRange = (iso: string | undefined) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= to;

    const subjects = db.subjects.filter((s) => subjectVisible(db, s) && (!filter.subjectSlug || s.slug === filter.subjectSlug) && (!filter.platform || platformOfSubject(db, s) === filter.platform));
    const subjectSlugs = new Set(subjects.map((s) => s.slug));
    const platformsInScope = new Set<PlatformSlug>(subjects.map((s) => platformOfSubject(db, s)));
    const topics = db.topics.filter((t) => subjectSlugs.has(t.subjectSlug) && topicVisible(db, t));
    const topicIds = new Set(topics.map((t) => t.id));
    const materials = db.materials.filter((m) => !m.deletedAt && subjectSlugs.has(m.subjectSlug));
    const materialIds = new Set(materials.map((m) => m.id));
    const tests = db.tests.filter((t) => !t.deletedAt && subjectSlugs.has(t.subjectSlug));
    const testIds = new Set(tests.map((t) => t.id));

    // Students in scope: every student account; with a platform / subject filter only those enrolled in the platform(s).
    const students = db.users.filter((u) => u.role === "STUDENT" && !u.deletedAt && (!(filter.platform || filter.subjectSlug) || db.enrollments.some((e) => e.userId === u.id && platformsInScope.has(e.platform))));
    const studentIds = new Set(students.map((u) => u.id));

    type Event = { userId: string; at: number; kind: "attempt" | "material" | "topic" };
    const events: Event[] = [];
    const attempts = db.attempts.filter((a) => a.result && a.submittedAt && testIds.has(a.testId) && studentIds.has(a.userId) && inRange(a.submittedAt));
    for (const a of attempts) events.push({ userId: a.userId, at: new Date(a.submittedAt!).getTime(), kind: "attempt" });
    const completed = db.materialProgress.filter((m) => materialIds.has(m.materialId) && studentIds.has(m.userId) && inRange(m.completedAt));
    for (const m of completed) events.push({ userId: m.userId, at: new Date(m.completedAt).getTime(), kind: "material" });
    for (const [userId, map] of db.progress) {
      if (!studentIds.has(userId)) continue;
      for (const [topicId, p] of map) if (topicIds.has(topicId) && inRange(p.updatedAt)) events.push({ userId, at: new Date(p.updatedAt).getTime(), kind: "topic" });
    }

    const scores = attempts.map((a) => a.result!.scorePercent);
    const passed = attempts.filter((a) => a.result!.passed).length;

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
        const mine = attempts.filter((a) => a.testId === t.id);
        const subject = db.subjects.find((s) => s.slug === t.subjectSlug);
        return {
          testId: t.id, title: t.title, subjectCode: subject?.code ?? t.subjectSlug, attempts: mine.length,
          avgScore: mine.length ? Math.round(mine.reduce((s, a) => s + a.result!.scorePercent, 0) / mine.length) : 0,
          passRate: mine.length ? Math.round((mine.filter((a) => a.result!.passed).length / mine.length) * 100) : 0,
        };
      })
      .filter((t) => t.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts);

    const subjectRows = subjects
      .map((s) => {
        const platform = platformOfSubject(db, s);
        const enrolled = students.filter((u) => db.enrollments.some((e) => e.userId === u.id && e.platform === platform));
        const avg = enrolled.length ? Math.round(enrolled.reduce((sum, u) => sum + subjectProgress(db, u.id, s.slug).percent, 0) / enrolled.length) : 0;
        return { subjectSlug: s.slug, code: s.code, name: s.name, platform, students: enrolled.length, avgProgress: avg };
      })
      .filter((s) => s.students > 0)
      .sort((a, b) => b.avgProgress - a.avgProgress || a.code.localeCompare(b.code));

    return {
      filter,
      totals: {
        students: students.length,
        activeStudents: new Set(events.map((e) => e.userId)).size,
        subjects: subjects.length, topics: topics.length, materials: materials.length, tests: tests.length,
        attempts: attempts.length,
        passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : null,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        completedMaterials: completed.length,
      },
      activity, activityBucket: bucket, testPerformance, subjectProgress: subjectRows,
      passFail: { passed, failed: attempts.length - passed },
    };
  },
};
