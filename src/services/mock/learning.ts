import "server-only";
import { materialLive } from "../domain/records";
import type { CertificateService, ExamService, ProgressService, RankingService } from "../contracts";
import type { Certificate, RankingEntry } from "@/types";
import type { PlatformSlug } from "@/types";
import { exams } from "@/data/mock/people";
import { publicName } from "../domain/names";
import { routes } from "@/lib/routes";
import { getDb, nowIso, platformOfSubject, pushActivity, pushNotification, topicVisible, userProgress } from "./db";
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
    const m = db.materials.find((x) => x.id === materialId && materialLive(x));
    if (m?.topicId) db.lastMaterial.set(userId, { materialId, at: nowIso() });
    // analytics: one real view per student and material per 30 minutes
    if (m && !db.materialViews.some((v) => v.userId === userId && v.materialId === materialId && Date.now() - new Date(v.at).getTime() < 30 * 60_000)) {
      db.materialViews.push({ materialId, userId, at: nowIso() });
    }
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


/**
 * Ranking from REAL records: active student accounts only, scored by the sum of their best test results in the
 * selected scope (platform / subject), ties broken by learning progress, then tests taken. Competition ranking
 * ("1, 2, 2, 4"): equal results share a rank. No invented learners.
 */
function computeRanking(userId: string, platform?: PlatformSlug, subjectSlug?: string): { all: RankingEntry[]; me: RankingEntry | null } {
  const db = getDb();
  const subjects = visibleSubjects(db).filter((s) => (!subjectSlug || s.slug === subjectSlug) && (!platform || platformOfSubject(db, s) === platform));
  const slugs = new Set(subjects.map((s) => s.slug));
  const platformsInScope = new Set(subjects.map((s) => platformOfSubject(db, s)));
  const filtered = !!(platform || subjectSlug);
  const students = db.users.filter((u) => u.role === "STUDENT" && u.status === "active" && !u.deletedAt);

  const rows = students
    .filter((u) => !filtered || [...platformsInScope].some((p) => isEnrolled(db, u.id, p)))
    .map((u) => {
      const best = new Map<string, number>();
      for (const a of db.attempts) {
        if (a.userId !== u.id || !a.result) continue;
        const test = db.tests.find((x) => x.id === a.testId);
        if (!test || !slugs.has(test.subjectSlug)) continue;
        best.set(a.testId, Math.max(best.get(a.testId) ?? 0, a.result.scorePercent));
      }
      const enrolled = [...platformsInScope].filter((p) => isEnrolled(db, u.id, p));
      const progress = subjectSlug
        ? (enrolled.length ? subjectProgress(db, u.id, subjectSlug).percent : 0)
        : enrolled.length ? Math.round(enrolled.reduce((sum, p) => sum + platformProgress(db, u.id, p), 0) / enrolled.length) : 0;
      return { u, points: [...best.values()].reduce((x, y) => x + y, 0), testsCompleted: best.size, progress };
    })
    .sort((x, y) => y.points - x.points || y.progress - x.progress || y.testsCompleted - x.testsCompleted || x.u.name.localeCompare(y.u.name));

  let rank = 0;
  const all = rows.map((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.points !== r.points || prev.progress !== r.progress || prev.testsCompleted !== r.testsCompleted) rank = i + 1;
    const mine = r.u.id === userId;
    return { rank, name: mine ? r.u.name : publicName(r.u.name), points: r.points, testsCompleted: r.testsCompleted, progress: r.progress, isCurrentUser: mine };
  });
  return { all, me: all.find((e) => e.isCurrentUser) ?? null };
}

export const rankingService: RankingService = {
  async top(userId, limit) {
    const { all, me } = computeRanking(userId);
    const top = all.slice(0, Math.max(limit, 0));
    return me && !top.includes(me) ? [...top, me] : top;
  },
  async list({ userId, platform, subjectSlug, limit = 50 }) {
    const { all, me } = computeRanking(userId, platform, subjectSlug);
    return { entries: all.slice(0, limit), me, total: all.length };
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
  async verifyByNumber(number) {
    const c = getDb().certificates.find((x) => x.number === number);
    return c ? { number: c.number, holder: publicName(c.studentName), platform: c.platform, subjectCode: c.subjectCode, subjectName: c.subjectName, issuedAt: c.issuedAt, status: c.status } : null;
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
    if (revoked) pushNotification(db, c.userId, { code: "certificate_revoked", params: { title: c.title }, target: { kind: "certificate", id: c.id } });
    return { ok: true, data: undefined };
  },
};

export const examService: ExamService = {
  async list() {
    return [...exams].sort((a, b) => a.startsAt.localeCompare(b.startsAt)); // demo fixtures: illustrative only — never startable, scores are sample data
  },
};
