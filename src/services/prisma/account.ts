import "server-only";
import type { DashboardService, NotificationService } from "../contracts";
import type { AppNotification, DashboardOverview, NotificationCode, NotificationTarget, PlatformSlug } from "@/types";
import { getPrisma } from "@/lib/prisma";
import { materialLive } from "../domain/records";
import { activePlatformsOf, platformOfSubject, platformProgress, subjectProgress, topicPercent, topicVisible, visibleSubjects, visibleTopicsOf } from "../domain/calc";
import { toUser } from "./auth-users";
import { certificateService, progressService, rankingService } from "./learning";
import { testService } from "./assessment";
import { loadCalcDbForRead } from "./load";

export const notificationService: NotificationService = {
  async list(userId) {
    const rows = await getPrisma().notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map<AppNotification>((n) => ({
      id: n.id, code: n.code as NotificationCode, params: (n.params ?? undefined) as Record<string, string> | undefined,
      createdAt: n.createdAt.toISOString(), read: !!n.readAt, target: n.target as unknown as NotificationTarget,
    }));
  },
  async unreadCount(userId) {
    return getPrisma().notification.count({ where: { userId, readAt: null } });
  },
  async markRead(userId, id) {
    // userId in the filter: a learner can only mark their own notifications (no IDOR through a guessed id).
    await getPrisma().notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  },
  async markAllRead(userId) {
    await getPrisma().notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  },
};

export const dashboardService: DashboardService = {
  async getOverview(userId): Promise<DashboardOverview> {
    const prisma = getPrisma();
    const rec = await prisma.user.findUnique({ where: { id: userId } });
    if (!rec) throw new Error("NOT_FOUND");

    const [calc, activity, topRank, certs, unread, results, published, last, times] = await Promise.all([
      loadCalcDbForRead([userId]),
      progressService.recentActivity(userId, 5),
      rankingService.top(userId, 5),
      certificateService.listForUser(userId),
      notificationService.unreadCount(userId),
      testService.listResults(userId, 3),
      testService.listPublished(userId),
      prisma.lastMaterial.findUnique({ where: { userId } }),
      prisma.testAttempt.aggregate({ where: { userId, status: "SUBMITTED" }, _sum: { timeSpentSeconds: true } }),
    ]);

    const enrolledPlatforms = new Set<PlatformSlug>(activePlatformsOf(calc, userId));
    const enrollments = calc.platforms
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        platform: p.slug,
        priceCents: p.priceCents,
        status: enrolledPlatforms.has(p.slug) ? ("active" as const) : ("not_enrolled" as const),
        progress: enrolledPlatforms.has(p.slug) ? platformProgress(calc, userId, p.slug) : 0,
      }));
    const active = enrollments.filter((e) => e.status === "active");

    // Everything below is derived from the learner's REAL state in the enrolled platforms.
    const progress = calc.progress.get(userId) ?? new Map();
    const subjects = visibleSubjects(calc).filter((s) => enrolledPlatforms.has(platformOfSubject(calc, s)));
    const topics = subjects.flatMap((s) => visibleTopicsOf(calc, s.slug).map((t) => ({ t, s })));
    const stored = (id: string) => progress.get(id)?.percent ?? 0;
    const pct = (id: string) => topicPercent(calc, userId, id); // materials + tests, not just the stored value
    const completed = topics.filter(({ t }) => stored(t.id) >= 100);
    const started = topics.filter(({ t }) => stored(t.id) < 100 && pct(t.id) > 0);
    const minutes = completed.reduce((a, { t }) => a + t.durationMinutes, 0) + Math.round((times._sum.timeSpentSeconds ?? 0) / 60);

    const continueLearning = started
      .sort((a, b) => (progress.get(b.t.id)?.updatedAt ?? "").localeCompare(progress.get(a.t.id)?.updatedAt ?? ""))
      .slice(0, 4)
      .map(({ t, s }) => ({ topicId: t.id, topicTitle: t.title, subjectName: s.name, platform: platformOfSubject(calc, s), progress: pct(t.id) }));

    const attempted = new Set(calc.attempts.filter((a) => a.userId === userId && a.result).map((a) => a.testId));
    const availableTests = published
      .filter((t) => {
        const s = calc.subjects.find((x) => x.slug === t.subjectSlug);
        return s && enrolledPlatforms.has(platformOfSubject(calc, s)) && !attempted.has(t.id);
      })
      .slice(0, 3)
      .map((test) => ({ test, subjectName: calc.subjects.find((s) => s.slug === test.subjectSlug)?.name ?? test.subjectSlug }));

    const subjectProgressList = subjects
      .map((s) => ({ s, p: subjectProgress(calc, userId, s.slug) }))
      .filter(({ p }) => p.total > 0)
      .sort((a, b) => b.p.percent - a.p.percent || a.s.code.localeCompare(b.s.code))
      .map(({ s, p }) => ({ subjectSlug: s.slug, code: s.code, name: s.name, platform: platformOfSubject(calc, s), percent: p.percent, completedTopics: p.completed, totalTopics: p.total }));

    // "Continue learning": the last material the learner opened — only if it is still visible and the topic is not locked.
    let lastMaterial: DashboardOverview["lastMaterial"] = null;
    const lm = last && calc.materials.find((m) => m.id === last.materialId && materialLive(m));
    const lt = lm?.topicId ? calc.topics.find((t) => t.id === lm.topicId) : undefined;
    const ls = lt && subjects.find((x) => x.slug === lt.subjectSlug);
    if (lm && lt && ls && topicVisible(calc, lt)) {
      const siblings = await prisma.material.findMany({ where: { topicId: lt.id, deletedAt: null, published: true, OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, title: true } });
      const lmTitle = siblings.find((m) => m.id === lm.id)?.title ?? "";
      lastMaterial = {
        materialId: lm.id, materialTitle: lmTitle, materialNumber: siblings.findIndex((m) => m.id === lm.id) + 1, materialTotal: siblings.length,
        topicId: lt.id, topicNumber: visibleTopicsOf(calc, ls.slug).findIndex((t) => t.id === lt.id) + 1, topicTitle: lt.title, subjectSlug: ls.slug, subjectCode: ls.code,
        platform: platformOfSubject(calc, ls), completed: calc.materialProgress.some((p) => p.userId === userId && p.materialId === lm.id),
      };
    }

    return {
      user: toUser(rec),
      lastMaterial,
      subjectProgress: subjectProgressList,
      stats: {
        enrolledCourses: active.length,
        enrolledSubjects: subjects.length,
        completedTopics: completed.length,
        learningHours: Math.round((minutes / 60) * 10) / 10,
        overallProgress: active.length ? Math.round(active.reduce((a, e) => a + e.progress, 0) / active.length) : 0,
      },
      enrollments,
      continueLearning,
      recentActivity: activity,
      progressBreakdown: { completed: completed.length, inProgress: started.length, notStarted: Math.max(0, topics.length - completed.length - started.length), total: topics.length },
      ranking: topRank,
      recentResults: results,
      availableTests,
      certificates: certs,
      unreadNotifications: unread,
    };
  },
};
