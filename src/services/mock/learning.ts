import "server-only";
import type { CertificateService, ExamService, ProgressService, RankingService } from "../contracts";
import type { PlatformSlug } from "@/types";
import { certificates, exams, ranking, DEMO_STUDENT_ID } from "@/data/mock/people";
import { routes } from "@/lib/routes";
import { getDb, nowIso, pushActivity, topicVisible, userProgress } from "./db";
import { platformProgress, subjectProgress } from "./calc";

export const progressService: ProgressService = {
  async getTopicProgress(userId) {
    const out: Record<string, number> = {};
    userProgress(getDb(), userId).forEach((v, k) => (out[k] = v.percent));
    return out;
  },
  async touchTopic(userId, topicId) {
    const db = getDb();
    const topic = db.topics.find((t) => t.id === topicId);
    if (!topicVisible(db, topic)) return;
    const p = userProgress(db, userId);
    if ((p.get(topicId)?.percent ?? 0) > 0) return;
    p.set(topicId, { percent: 10, updatedAt: nowIso() });
    const subject = db.subjects.find((s) => s.slug === topic.subjectSlug);
    pushActivity(db, { userId, kind: "topic", title: topic.title, context: subject?.name ?? "", href: routes.topic(topicId), detail: "10%" });
  },
  async markTopicCompleted(userId, topicId) {
    const db = getDb();
    const topic = db.topics.find((t) => t.id === topicId);
    if (!topicVisible(db, topic)) throw new Error("NOT_FOUND");
    const p = userProgress(db, userId);
    const wasDone = (p.get(topicId)?.percent ?? 0) >= 100;
    p.set(topicId, { percent: 100, updatedAt: nowIso() });
    if (!wasDone) {
      const subject = db.subjects.find((s) => s.slug === topic.subjectSlug);
      pushActivity(db, { userId, kind: "topic", title: topic.title, context: subject?.name ?? "", href: routes.topic(topicId), detail: "100%" });
    }
  },
  async getSubjectProgress(userId, subjectSlug) {
    return subjectProgress(getDb(), userId, subjectSlug);
  },
  async getPlatformProgress(userId) {
    const db = getDb();
    return { acca: platformProgress(db, userId, "acca"), fia: platformProgress(db, userId, "fia") } satisfies Record<PlatformSlug, number>;
  },
  async recentActivity(userId, limit = 6) {
    return getDb().activity.filter((a) => a.userId === userId).slice(0, limit).map((a) => ({
      id: a.id, kind: a.kind, title: a.title, context: a.context, href: a.href, occurredAt: a.at, detail: a.detail,
    }));
  },
};

/** Demo ranking: fictional learners + (for the demo student) their own row. Advanced ranking is a later block. */
export const rankingService: RankingService = {
  async top(userId, limit) {
    return ranking.slice(0, Math.max(limit, 0)).map((r) => ({ ...r, isCurrentUser: r.userId === userId }));
  },
};

export const certificateService: CertificateService = {
  async listForUser(userId) {
    return userId === DEMO_STUDENT_ID ? certificates : [];
  },
};

export const examService: ExamService = {
  async list() {
    return exams;
  },
};
