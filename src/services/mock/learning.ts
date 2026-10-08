import "server-only";
import type { CertificateService, ExamService, ProgressService, RankingService } from "../contracts";
import type { PlatformSlug } from "@/types";
import { certificates, exams, ranking, DEMO_STUDENT_ID } from "@/data/mock/people";
import { routes } from "@/lib/routes";
import { getDb, nowIso, pushActivity, topicVisible, userProgress } from "./db";
import { platformProgress, subjectProgress, topicEarned, topicPercent } from "./calc";

export const progressService: ProgressService = {
  async getTopicProgress(userId) {
    const db = getDb();
    const out: Record<string, number> = {};
    userProgress(db, userId).forEach((_v, k) => (out[k] = topicPercent(db, userId, k)));
    for (const t of db.topics) if (topicVisible(db, t) && !(t.id in out)) { const p = topicPercent(db, userId, t.id); if (p > 0) out[t.id] = p; }
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
  async touchMaterial(userId, materialId) {
    const db = getDb();
    const m = db.materials.find((x) => x.id === materialId && !x.deletedAt);
    if (m?.topicId) db.lastMaterial.set(userId, { materialId, at: nowIso() });
  },
  async listCompletedMaterials(userId, materialIds) {
    const wanted = new Set(materialIds);
    return getDb().materialProgress.filter((m) => m.userId === userId && wanted.has(m.materialId)).map((m) => m.materialId);
  },
  async setMaterialCompleted(userId, materialId, completed) {
    const db = getDb();
    const rest = db.materialProgress.filter((m) => !(m.userId === userId && m.materialId === materialId));
    if (completed) rest.push({ userId, materialId, completedAt: nowIso() });
    db.materialProgress = rest;
    // All materials done (and the topic's test passed, if it has one) completes the topic and unlocks the next one.
    const topicId = db.materials.find((m) => m.id === materialId)?.topicId;
    const topic = topicId ? db.topics.find((t) => t.id === topicId) : undefined;
    if (completed && topic && topicVisible(db, topic) && topicEarned(db, userId, topic.id)) {
      const p = userProgress(db, userId);
      if ((p.get(topic.id)?.percent ?? 0) < 100) {
        p.set(topic.id, { percent: 100, updatedAt: nowIso() });
        const subject = db.subjects.find((s) => s.slug === topic.subjectSlug);
        pushActivity(db, { userId, kind: "topic", title: topic.title, context: subject?.name ?? "", href: routes.topic(topic.id), detail: "100%" });
      }
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
