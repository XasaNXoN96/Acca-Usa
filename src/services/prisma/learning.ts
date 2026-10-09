import "server-only";
import type { CertificateService, ExamService, ProgressService, RankingService } from "../contracts";
import type { Certificate, Exam, PlatformSlug, RankingEntry } from "@/types";
import { routes } from "@/lib/routes";
import { getPrisma } from "@/lib/prisma";
import {
  isEnrolled, platformOfSubject, platformProgress, subjectProgress, topicEarned, topicPercent, topicVisible, visibleSubjects,
} from "../domain/calc";
import { activeCertificate, createCertificate, issueIfEarned, toIssuedCertificate } from "./certs-core";
import { notifyUser, recordActivity } from "./events";
import { publicName } from "../domain/names";
import { loadCalcDb, loadCalcDbForRead } from "./load";

const err = (code: string, field?: string) => ({ ok: false as const, code, field });
const ok = { ok: true as const, data: undefined };

export const progressService: ProgressService = {
  async getTopicProgress(userId) {
    const calc = await loadCalcDbForRead([userId]);
    const out: Record<string, number> = {};
    for (const t of calc.topics) {
      if (!topicVisible(calc, t)) continue;
      const p = topicPercent(calc, userId, t.id);
      if (p > 0 || calc.progress.get(userId)?.has(t.id)) out[t.id] = p;
    }
    return out;
  },
  async touchTopic(userId, topicId) {
    const prisma = getPrisma();
    const topic = await prisma.topic.findFirst({ where: { id: topicId, deletedAt: null, subject: { deletedAt: null, level: { platform: { deletedAt: null } } } }, include: { subject: true } });
    if (!topic) return;
    // Created only when missing: a later "started" visit never lowers a completed topic.
    const created = await prisma.topicProgress.createMany({ data: [{ userId, topicId, percent: 10 }], skipDuplicates: true });
    const existing = created.count ? null : await prisma.topicProgress.findUnique({ where: { userId_topicId: { userId, topicId } } });
    if (existing && existing.percent > 0) return;
    if (existing) await prisma.topicProgress.update({ where: { userId_topicId: { userId, topicId } }, data: { percent: 10 } });
    await recordActivity({ userId, kind: "topic", title: topic.title, context: topic.subject.name, href: routes.topic(topicId), detail: "10%" });
  },
  async markTopicCompleted(userId, topicId) {
    const prisma = getPrisma();
    const topic = await prisma.topic.findFirst({ where: { id: topicId, deletedAt: null, subject: { deletedAt: null, level: { platform: { deletedAt: null } } } }, include: { subject: true } });
    if (!topic) throw new Error("NOT_FOUND");
    const before = await prisma.topicProgress.findUnique({ where: { userId_topicId: { userId, topicId } } });
    await prisma.topicProgress.upsert({ where: { userId_topicId: { userId, topicId } }, create: { userId, topicId, percent: 100 }, update: { percent: 100 } });
    if ((before?.percent ?? 0) < 100) {
      await recordActivity({ userId, kind: "topic", title: topic.title, context: topic.subject.name, href: routes.topic(topicId), detail: "100%" });
      await issueIfEarned(userId, topic.subjectSlug);
    }
  },
  async touchMaterial(userId, materialId) {
    const m = await getPrisma().material.findFirst({ where: { id: materialId, deletedAt: null, published: true, OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }], topicId: { not: null } }, select: { id: true } });
    if (m) await getPrisma().lastMaterial.upsert({ where: { userId }, create: { userId, materialId }, update: { materialId, at: new Date() } });
  },
  async listCompletedMaterials(userId, materialIds) {
    if (!materialIds.length) return [];
    return (await getPrisma().materialProgress.findMany({ where: { userId, materialId: { in: materialIds } }, select: { materialId: true } })).map((m) => m.materialId);
  },
  async setMaterialCompleted(userId, materialId, completed) {
    const prisma = getPrisma();
    const material = await prisma.material.findUnique({ where: { id: materialId }, select: { topicId: true } });
    if (!material) return;
    if (completed) await prisma.materialProgress.upsert({ where: { userId_materialId: { userId, materialId } }, create: { userId, materialId }, update: {} });
    else await prisma.materialProgress.deleteMany({ where: { userId, materialId } });
    // All materials done (and the topic's test passed, if it has one) completes the topic and unlocks the next one.
    if (!completed || !material.topicId) return;
    const calc = await loadCalcDb([userId]);
    const topic = calc.topics.find((t) => t.id === material.topicId);
    if (!topic || !topicVisible(calc, topic) || !topicEarned(calc, userId, topic.id)) return;
    if ((calc.progress.get(userId)?.get(topic.id)?.percent ?? 0) >= 100) return;
    await prisma.topicProgress.upsert({ where: { userId_topicId: { userId, topicId: topic.id } }, create: { userId, topicId: topic.id, percent: 100 }, update: { percent: 100 } });
    const subject = calc.subjects.find((s) => s.slug === topic.subjectSlug);
    await recordActivity({ userId, kind: "topic", title: topic.title, context: subject?.name ?? "", href: routes.topic(topic.id), detail: "100%" });
    await issueIfEarned(userId, topic.subjectSlug);
  },
  async getSubjectProgress(userId, subjectSlug) {
    return subjectProgress(await loadCalcDbForRead([userId]), userId, subjectSlug);
  },
  async getPlatformProgress(userId) {
    const calc = await loadCalcDbForRead([userId]);
    return { acca: platformProgress(calc, userId, "acca"), fia: platformProgress(calc, userId, "fia") } satisfies Record<PlatformSlug, number>;
  },
  async recentActivity(userId, limit = 6) {
    const rows = await getPrisma().activity.findMany({ where: { userId }, orderBy: { at: "desc" }, take: limit });
    return rows.map((a) => ({ id: a.id, kind: a.kind, title: a.title, context: a.context, href: a.href, occurredAt: a.at.toISOString(), detail: a.detail ?? undefined }));
  },
};


/**
 * Ranking from REAL records: active student accounts only, scored by the sum of their best test results in the
 * selected scope (platform / subject), ties broken by learning progress, then tests taken. Competition ranking
 * ("1, 2, 2, 4"): equal results share a rank. No invented learners.
 */
async function computeRanking(userId: string, platform?: PlatformSlug, subjectSlug?: string): Promise<{ all: RankingEntry[]; me: RankingEntry | null }> {
  const prisma = getPrisma();
  const [calc, students, attempts, tests] = await Promise.all([
    loadCalcDbForRead("all"),
    prisma.user.findMany({ where: { role: "STUDENT", status: "active", deletedAt: null }, select: { id: true, name: true } }),
    prisma.testAttempt.findMany({ where: { status: "SUBMITTED", scorePercent: { not: null } }, select: { userId: true, testId: true, scorePercent: true } }),
    prisma.test.findMany({ select: { id: true, subjectSlug: true } }),
  ]);
  const subjects = visibleSubjects(calc).filter((s) => (!subjectSlug || s.slug === subjectSlug) && (!platform || platformOfSubject(calc, s) === platform));
  const slugs = new Set(subjects.map((s) => s.slug));
  const platformsInScope = [...new Set(subjects.map((s) => platformOfSubject(calc, s)))];
  const filtered = !!(platform || subjectSlug);
  const testSubject = new Map(tests.map((t) => [t.id, t.subjectSlug]));
  const bestByUser = new Map<string, Map<string, number>>();
  for (const a of attempts) {
    const sub = testSubject.get(a.testId);
    if (!sub || !slugs.has(sub)) continue;
    let m = bestByUser.get(a.userId);
    if (!m) bestByUser.set(a.userId, (m = new Map()));
    m.set(a.testId, Math.max(m.get(a.testId) ?? 0, a.scorePercent ?? 0));
  }

  const rows = students
    .filter((u) => !filtered || platformsInScope.some((p) => isEnrolled(calc, u.id, p)))
    .map((u) => {
      const best = bestByUser.get(u.id) ?? new Map<string, number>();
      const enrolled = platformsInScope.filter((p) => isEnrolled(calc, u.id, p));
      const progress = subjectSlug
        ? (enrolled.length ? subjectProgress(calc, u.id, subjectSlug).percent : 0)
        : enrolled.length ? Math.round(enrolled.reduce((sum, p) => sum + platformProgress(calc, u.id, p), 0) / enrolled.length) : 0;
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
    const { all, me } = await computeRanking(userId);
    const top = all.slice(0, Math.max(limit, 0));
    return me && !top.includes(me) ? [...top, me] : top;
  },
  async list({ userId, platform, subjectSlug, limit = 50 }) {
    const { all, me } = await computeRanking(userId, platform, subjectSlug);
    return { entries: all.slice(0, limit), me, total: all.length };
  },
};

export const certificateService: CertificateService = {
  async listForUser(userId) {
    const prisma = getPrisma();
    const [rows, calc] = await Promise.all([prisma.certificate.findMany({ where: { userId }, orderBy: { issuedAt: "desc" } }), loadCalcDbForRead([userId])]);
    const mine = rows.map<Certificate>((c) => ({
      id: c.id, title: c.title, platform: c.platformSlug as PlatformSlug, status: c.status === "issued" ? "earned" : "revoked",
      issuedAt: c.issuedAt.toISOString(), progress: 100, number: c.number, subjectSlug: c.subjectSlug,
    }));
    const have = new Set(rows.map((c) => c.subjectSlug));
    // Progress towards certificates: enrolled subjects that are started but not finished and have no certificate yet.
    const inProgress = visibleSubjects(calc)
      .filter((s) => isEnrolled(calc, userId, platformOfSubject(calc, s)) && !have.has(s.slug))
      .map((s) => ({ s, p: subjectProgress(calc, userId, s.slug) }))
      .filter(({ p }) => p.total > 0 && p.percent > 0 && p.percent < 100)
      .sort((x, y) => y.p.percent - x.p.percent)
      .slice(0, 6)
      .map<Certificate>(({ s, p }) => ({
        id: `progress-${s.slug}`, title: `${platformOfSubject(calc, s).toUpperCase()} ${s.code} — ${s.name}`, platform: platformOfSubject(calc, s),
        status: "in_progress", progress: p.percent, subjectSlug: s.slug,
      }));
    return [...mine, ...inProgress];
  },
  async getForUser(userId, id, asAdmin) {
    const c = await getPrisma().certificate.findUnique({ where: { id } });
    return c && (asAdmin || c.userId === userId) ? toIssuedCertificate(c) : null;
  },
  async verifyByNumber(number) {
    const c = await getPrisma().certificate.findUnique({ where: { number } });
    return c ? { number: c.number, holder: publicName(c.studentName), platform: c.platformSlug as PlatformSlug, subjectCode: c.subjectCode, subjectName: c.subjectName, issuedAt: c.issuedAt.toISOString(), status: c.status } : null;
  },
  async listAll() {
    return (await getPrisma().certificate.findMany({ orderBy: { issuedAt: "desc" } })).map(toIssuedCertificate);
  },
  async issue({ userId, subjectSlug }) {
    const prisma = getPrisma();
    const [user, subject] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, role: "STUDENT", deletedAt: null } }),
      prisma.subject.findFirst({ where: { slug: subjectSlug, deletedAt: null }, include: { level: true } }),
    ]);
    if (!user) return err("NOT_FOUND", "student");
    if (!subject) return err("NOT_FOUND", "subject");
    const calc = await loadCalcDb([userId]);
    if (!isEnrolled(calc, userId, subject.level.platformSlug as PlatformSlug)) return err("NOT_ENROLLED", "student");
    if (await activeCertificate(userId, subjectSlug)) return err("CERT_EXISTS", "subject");
    const cert = await createCertificate(userId, subjectSlug, "admin");
    return cert ? { ok: true, data: { id: cert.id } } : err("NOT_FOUND");
  },
  async setRevoked(id, revoked) {
    const prisma = getPrisma();
    const c = await prisma.certificate.findUnique({ where: { id } });
    if (!c) return err("NOT_FOUND");
    if (!revoked && c.status === "revoked" && (await activeCertificate(c.userId, c.subjectSlug))) return err("CERT_EXISTS");
    await prisma.certificate.update({ where: { id }, data: { status: revoked ? "revoked" : "issued", revokedAt: revoked ? new Date() : null } });
    if (revoked) await notifyUser(c.userId, { code: "certificate_revoked", params: { title: c.title }, target: { kind: "certificate", id: c.id } });
    return ok;
  },
};

/** Exams are Tests with kind = "exam" (see docs/DATABASE.md). Nothing is invented: no exam rows → an empty list. */
export const examService: ExamService = {
  async list(userId) {
    const prisma = getPrisma();
    const now = Date.now();
    const rows = await prisma.test.findMany({
      where: { kind: "exam", published: true, deletedAt: null, subject: { deletedAt: null, level: { platform: { deletedAt: null } } } },
      orderBy: [{ opensAt: "asc" }, { createdAt: "asc" }],
      include: { subject: { include: { level: true } } },
    });
    const best = new Map<string, number>();
    const enrolled = new Set<string>();
    if (userId) {
      const [scores, mine] = await Promise.all([
        prisma.testAttempt.groupBy({ by: ["testId"], where: { userId, status: "SUBMITTED", testId: { in: rows.map((t) => t.id) } }, _max: { scorePercent: true } }),
        prisma.enrollment.findMany({ where: { userId, status: { in: ["FREE", "ACTIVE"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { platformSlug: true } }),
      ]);
      for (const r of scores) if (r._max.scorePercent !== null) best.set(r.testId, r._max.scorePercent);
      for (const e of mine) enrolled.add(e.platformSlug);
    }
    return rows.map<Exam>((t) => {
      const startsAt = (t.opensAt ?? t.createdAt).getTime();
      const closed = t.closesAt ? t.closesAt.getTime() < now : false;
      const status = closed ? "completed" : startsAt <= now ? "open" : "scheduled";
      const platform = t.subject.level.platformSlug;
      return {
        id: t.id, title: t.title, platform: platform as PlatformSlug, subjectSlug: t.subjectSlug, startsAt: new Date(startsAt).toISOString(),
        durationMinutes: t.durationMinutes, status, score: best.get(t.id), startable: status === "open" && enrolled.has(platform),
      };
    });
  },
};
