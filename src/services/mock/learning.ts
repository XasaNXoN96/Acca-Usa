import "server-only";
import type { CertificateService, ExamService, ProgressService, RankingService } from "../contracts";
import type { Certificate } from "@/types";
import type { PlatformSlug } from "@/types";
import { exams, ranking } from "@/data/mock/people";
import { routes } from "@/lib/routes";
import { getDb, nowIso, platformOfSubject, pushActivity, topicVisible, userProgress } from "./db";
import { activeCertificate, createCertificate, issueIfEarned } from "./certs-core";
import { isEnrolled, platformProgress, subjectProgress, topicEarned, topicPercent, visibleSubjects } from "./calc";

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
      issueIfEarned(db, userId, topic.subjectSlug);
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
        issueIfEarned(db, userId, topic.subjectSlug);
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
    const db = getDb();
    const mine = db.certificates
      .filter((c) => c.userId === userId)
      .sort((x, y) => y.issuedAt.localeCompare(x.issuedAt))
      .map<Certificate>((c) => ({
        id: c.id, title: c.title, platform: c.platform, status: c.status === "issued" ? "earned" : "revoked", issuedAt: c.issuedAt, progress: 100, number: c.number, subjectSlug: c.subjectSlug,
      }));
    // Progress towards certificates: enrolled subjects that are started but not finished and have no certificate yet.
    const inProgress = visibleSubjects(db)
      .filter((s) => isEnrolled(db, userId, platformOfSubject(db, s)) && !db.certificates.some((c) => c.userId === userId && c.subjectSlug === s.slug))
      .map((s) => ({ s, p: subjectProgress(db, userId, s.slug) }))
      .filter(({ p }) => p.total > 0 && p.percent > 0 && p.percent < 100)
      .sort((x, y) => y.p.percent - x.p.percent)
      .slice(0, 6)
      .map<Certificate>(({ s, p }) => ({ id: `progress-${s.slug}`, title: `${platformOfSubject(db, s).toUpperCase()} ${s.code} — ${s.name}`, platform: platformOfSubject(db, s), status: "in_progress", progress: p.percent, subjectSlug: s.slug }));
    return [...mine, ...inProgress];
  },
  async getForUser(userId, id, asAdmin) {
    const c = getDb().certificates.find((x) => x.id === id);
    return c && (asAdmin || c.userId === userId) ? c : null;
  },
  async listAll() {
    return [...getDb().certificates].sort((x, y) => y.issuedAt.localeCompare(x.issuedAt));
  },
  async issue({ userId, subjectSlug }) {
    const db = getDb();
    const user = db.users.find((u) => u.id === userId && u.role === "STUDENT" && !u.deletedAt);
    const subject = db.subjects.find((s) => s.slug === subjectSlug && !s.deletedAt);
    if (!user) return { ok: false, code: "NOT_FOUND", field: "student" };
    if (!subject) return { ok: false, code: "NOT_FOUND", field: "subject" };
    if (!isEnrolled(db, userId, platformOfSubject(db, subject))) return { ok: false, code: "NOT_ENROLLED", field: "student" };
    if (activeCertificate(db, userId, subjectSlug)) return { ok: false, code: "CERT_EXISTS", field: "subject" };
    const cert = createCertificate(db, userId, subjectSlug, "admin");
    return cert ? { ok: true, data: { id: cert.id } } : { ok: false, code: "NOT_FOUND" };
  },
  async setRevoked(id, revoked) {
    const db = getDb();
    const c = db.certificates.find((x) => x.id === id);
    if (!c) return { ok: false, code: "NOT_FOUND" };
    if (!revoked && activeCertificate(db, c.userId, c.subjectSlug) && c.status === "revoked") return { ok: false, code: "CERT_EXISTS" };
    c.status = revoked ? "revoked" : "issued";
    c.revokedAt = revoked ? nowIso() : undefined;
    return { ok: true, data: undefined };
  },
};

export const examService: ExamService = {
  async list() {
    return exams;
  },
};
