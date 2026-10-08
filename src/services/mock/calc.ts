import "server-only";
import type { PlatformSlug, TopicStatus, TopicWithStatus } from "@/types";
import { platformOfSubject, subjectVisible, topicVisible, userProgress, type Db, type SubjectRec, type TopicRec } from "./db";

export function visibleTopicsOf(db: Db, subjectSlug: string): TopicRec[] {
  return db.topics.filter((t) => t.subjectSlug === subjectSlug && topicVisible(db, t)).sort((a, b) => a.order - b.order);
}

export function visibleSubjects(db: Db): SubjectRec[] {
  return db.subjects.filter((s) => subjectVisible(db, s));
}

/** Sequential unlocking: completed topics + the first unfinished one are open; the rest are locked. */
export function topicsWithStatus(db: Db, userId: string, subjectSlug: string): TopicWithStatus[] {
  const progress = userProgress(db, userId);
  let currentFound = false;
  return visibleTopicsOf(db, subjectSlug).map((t, i) => {
    const percent = progress.get(t.id)?.percent ?? 0;
    let status: TopicStatus;
    if (percent >= 100) status = "completed";
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
  const sum = topics.reduce((a, t) => a + Math.min(100, progress.get(t.id)?.percent ?? 0), 0);
  const completed = topics.filter((t) => (progress.get(t.id)?.percent ?? 0) >= 100).length;
  return { percent: total ? Math.round(sum / total) : 0, completed, total };
}

export function platformProgress(db: Db, userId: string, platform: PlatformSlug): number {
  const progress = userProgress(db, userId);
  const subjects = visibleSubjects(db).filter((s) => platformOfSubject(db, s) === platform);
  let total = 0;
  let sum = 0;
  for (const s of subjects) {
    for (const t of visibleTopicsOf(db, s.slug)) {
      total += 1;
      sum += Math.min(100, progress.get(t.id)?.percent ?? 0);
    }
  }
  return total ? Math.round(sum / total) : 0;
}

export function isEnrolled(db: Db, userId: string, platform: PlatformSlug): boolean {
  return db.enrollments.some((e) => e.userId === userId && e.platform === platform);
}
