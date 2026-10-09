import type { PlatformSlug, TopicStatus, TopicWithStatus } from "@/types";
import { materialLive, type CalcDb as Db, type EnrollmentStatusValue, type ProgressEntry, type SubjectRec, type TopicRec } from "./records";

/* ---------- visibility helpers (soft delete cascades at read time) ---------- */

export function subjectVisible(db: Db, s: SubjectRec | undefined): s is SubjectRec {
  if (!s || s.deletedAt) return false;
  const level = db.levels.find((l) => l.id === s.levelId);
  const platform = level && db.platforms.find((p) => p.slug === level.platform);
  return !!platform && !platform.deletedAt;
}
export const platformOfSubject = (db: Db, s: SubjectRec): PlatformSlug => db.levels.find((l) => l.id === s.levelId)?.platform ?? "acca";

export function topicVisible(db: Db, t: TopicRec | undefined): t is TopicRec {
  return !!t && !t.deletedAt && subjectVisible(db, db.subjects.find((s) => s.slug === t.subjectSlug));
}

export function userProgress(db: Db, userId: string): Map<string, ProgressEntry> {
  let m = db.progress.get(userId);
  if (!m) {
    m = new Map();
    db.progress.set(userId, m);
  }
  return m;
}


export function visibleTopicsOf(db: Db, subjectSlug: string): TopicRec[] {
  return db.topics.filter((t) => t.subjectSlug === subjectSlug && topicVisible(db, t)).sort((a, b) => a.order - b.order);
}

export function visibleSubjects(db: Db): SubjectRec[] {
  return db.subjects.filter((s) => subjectVisible(db, s));
}

/** Published, non-archived tests of a topic that still have at least one published question. */
function topicTests(db: Db, topicId: string) {
  return db.tests.filter(
    (x) => x.topicId === topicId && x.published && !x.deletedAt && x.questionIds.some((id) => db.questions.some((q) => q.id === id && !q.deletedAt && q.status === "published")),
  );
}

/**
 * Learning progress of one topic = what the learner actually did:
 *   • material completion (completed materials / materials of the topic)
 *   • test result (best score of the topic's published tests)
 * Both components count 50 / 50 (a single component counts 100). An explicitly completed topic (stored 100 — "Mark
 * topic completed" or a passed test) is always 100, and the stored "started" value is the floor.
 */
export function topicPercent(db: Db, userId: string, topicId: string): number {
  const stored = userProgress(db, userId).get(topicId)?.percent ?? 0;
  if (stored >= 100) return 100;
  const materials = db.materials.filter((m) => m.topicId === topicId && materialLive(m));
  const tests = topicTests(db, topicId);
  const parts: number[] = [];
  if (materials.length) {
    const done = materials.filter((m) => db.materialProgress.some((p) => p.userId === userId && p.materialId === m.id)).length;
    parts.push((done / materials.length) * 100);
  }
  if (tests.length) {
    const best = db.attempts
      .filter((a) => a.userId === userId && a.result && tests.some((x) => x.id === a.testId))
      .reduce((max, a) => Math.max(max, a.result!.scorePercent), 0);
    parts.push(best);
  }
  const derived = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  return Math.min(99, Math.max(stored, Math.round(derived)));
}

/** True when every material of the topic is completed and (if the topic has a test) a test was passed. */
export function topicEarned(db: Db, userId: string, topicId: string): boolean {
  const materials = db.materials.filter((m) => m.topicId === topicId && materialLive(m));
  if (!materials.length) return false;
  if (!materials.every((m) => db.materialProgress.some((p) => p.userId === userId && p.materialId === m.id))) return false;
  const tests = topicTests(db, topicId);
  return tests.length === 0 || db.attempts.some((a) => a.userId === userId && a.result?.passed && tests.some((x) => x.id === a.testId));
}

/** Sequential unlocking: completed topics + the first unfinished one are open; the rest are locked. */
export function topicsWithStatus(db: Db, userId: string, subjectSlug: string): TopicWithStatus[] {
  const progress = userProgress(db, userId);
  let currentFound = false;
  return visibleTopicsOf(db, subjectSlug).map((t, i) => {
    const stored = progress.get(t.id)?.percent ?? 0; // completion + unlocking are driven by the stored value
    const percent = topicPercent(db, userId, t.id); // what the learner has actually done (materials + tests)
    let status: TopicStatus;
    if (stored >= 100) status = "completed";
    else if (!currentFound) {
      currentFound = true;
      status = percent > 0 ? "in_progress" : "unlocked";
    } else status = "locked";
    const { createdAt: _c, deletedAt: _d, ...topic } = t;
    return { ...topic, order: i + 1, progress: percent, status };
  });
}

export function subjectProgress(db: Db, userId: string, subjectSlug: string) {
  const topics = visibleTopicsOf(db, subjectSlug);
  const progress = userProgress(db, userId);
  const total = topics.length;
  const sum = topics.reduce((a, t) => a + topicPercent(db, userId, t.id), 0);
  const completed = topics.filter((t) => (progress.get(t.id)?.percent ?? 0) >= 100).length;
  return { percent: total ? Math.round(sum / total) : 0, completed, total };
}

export function platformProgress(db: Db, userId: string, platform: PlatformSlug): number {
  const subjects = visibleSubjects(db).filter((s) => platformOfSubject(db, s) === platform);
  let total = 0;
  let sum = 0;
  for (const s of subjects) {
    for (const t of visibleTopicsOf(db, s.slug)) {
      total += 1;
      sum += topicPercent(db, userId, t.id);
    }
  }
  return total ? Math.round(sum / total) : 0;
}

/**
 * Access rule (single source of truth, used by every data provider): an enrolment grants access only while its status is
 * FREE or ACTIVE and it has not passed `expiresAt`. EXPIRED / REVOKED never grant access, whatever the dates say.
 */
export function enrollmentActive(e: { status?: EnrollmentStatusValue; expiresAt?: string }, now = Date.now()): boolean {
  if (e.status && e.status !== "FREE" && e.status !== "ACTIVE") return false;
  return !e.expiresAt || Date.parse(e.expiresAt) > now;
}

export function isEnrolled(db: Db, userId: string, platform: PlatformSlug): boolean {
  return db.enrollments.some((e) => e.userId === userId && e.platform === platform && enrollmentActive(e));
}

/** Platforms the user currently has access to. */
export function activePlatformsOf(db: Db, userId: string): PlatformSlug[] {
  return [...new Set(db.enrollments.filter((e) => e.userId === userId && enrollmentActive(e)).map((e) => e.platform))];
}
