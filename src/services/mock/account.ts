import "server-only";
import type { DashboardService, NotificationService, PaymentService } from "../contracts";
import type { DashboardOverview, PlatformSlug } from "@/types";
import { DEMO_STUDENT_ID, payments } from "@/data/mock/people";
import { getDb, platformOfSubject, topicVisible, userNotifications, userProgress } from "./db";
import { platformProgress, subjectProgress, topicPercent, visibleSubjects, visibleTopicsOf } from "./calc";
import { authService, toUser, userService } from "./auth-users";
import { certificateService, progressService, rankingService } from "./learning";
import { testService } from "./assessment";

export const paymentService: PaymentService = {
  async listForUser(userId) {
    return userId === DEMO_STUDENT_ID ? payments.filter((p) => p.studentName === "Demo Student") : [];
  },
  async listAll() {
    return payments;
  },
};

export const notificationService: NotificationService = {
  async list(userId) {
    return [...userNotifications(getDb(), userId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async unreadCount(userId) {
    return userNotifications(getDb(), userId).filter((n) => !n.read).length;
  },
  async markRead(userId, id) {
    const n = userNotifications(getDb(), userId).find((x) => x.id === id);
    if (n) n.read = true;
  },
  async markAllRead(userId) {
    userNotifications(getDb(), userId).forEach((n) => (n.read = true));
  },
};

export const dashboardService: DashboardService = {
  async getOverview(userId): Promise<DashboardOverview> {
    const db = getDb();
    const rec = db.users.find((u) => u.id === userId);
    if (!rec) throw new Error("NOT_FOUND");

    const [activity, topRank, certs, unread, results, published] = await Promise.all([
      progressService.recentActivity(userId, 5),
      rankingService.top(userId, 5),
      certificateService.listForUser(userId),
      notificationService.unreadCount(userId),
      testService.listResults(userId, 3),
      testService.listPublished(userId),
    ]);

    const enrolledPlatforms = new Set<PlatformSlug>(db.enrollments.filter((e) => e.userId === userId).map((e) => e.platform));
    const enrollments = db.platforms
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        platform: p.slug,
        status: enrolledPlatforms.has(p.slug) ? ("active" as const) : ("not_enrolled" as const),
        progress: enrolledPlatforms.has(p.slug) ? platformProgress(db, userId, p.slug) : 0,
      }));
    const active = enrollments.filter((e) => e.status === "active");

    // Everything below is derived from the learner's REAL state in the enrolled platforms.
    const progress = userProgress(db, userId);
    const subjects = visibleSubjects(db).filter((s) => enrolledPlatforms.has(platformOfSubject(db, s)));
    const topics = subjects.flatMap((s) => visibleTopicsOf(db, s.slug).map((t) => ({ t, s })));
    const stored = (id: string) => progress.get(id)?.percent ?? 0;
    const pct = (id: string) => topicPercent(db, userId, id); // materials + tests, not just the stored value
    const completed = topics.filter(({ t }) => stored(t.id) >= 100);
    const started = topics.filter(({ t }) => stored(t.id) < 100 && pct(t.id) > 0);
    const testSeconds = db.attempts.filter((a) => a.userId === userId && a.result).reduce((sum, a) => sum + a.result!.timeSpentSeconds, 0);
    const minutes = completed.reduce((a, { t }) => a + t.durationMinutes, 0) + Math.round(testSeconds / 60);

    const continueLearning = started
      .sort((a, b) => (progress.get(b.t.id)?.updatedAt ?? "").localeCompare(progress.get(a.t.id)?.updatedAt ?? ""))
      .slice(0, 4)
      .map(({ t, s }) => ({ topicId: t.id, topicTitle: t.title, subjectName: s.name, platform: platformOfSubject(db, s), progress: pct(t.id) }));

    const attempted = new Set(db.attempts.filter((a) => a.userId === userId && a.result).map((a) => a.testId));
    const subjectName = (slug: string) => db.subjects.find((s) => s.slug === slug)?.name ?? slug;
    const availableTests = published
      .filter((t) => {
        const s = db.subjects.find((x) => x.slug === t.subjectSlug);
        return s && enrolledPlatforms.has(platformOfSubject(db, s)) && !attempted.has(t.id);
      })
      .slice(0, 3)
      .map((test) => ({ test, subjectName: subjectName(test.subjectSlug) }));

    const subjectProgressList = subjects
      .map((s) => ({ s, p: subjectProgress(db, userId, s.slug) }))
      .filter(({ p }) => p.total > 0)
      .sort((a, b) => b.p.percent - a.p.percent || a.s.code.localeCompare(b.s.code))
      .map(({ s, p }) => ({ subjectSlug: s.slug, code: s.code, name: s.name, platform: platformOfSubject(db, s), percent: p.percent, completedTopics: p.completed, totalTopics: p.total }));

    // "Continue learning": the last material the learner opened — only if it is still visible and the topic is not locked.
    let lastMaterial: DashboardOverview["lastMaterial"] = null;
    const last = db.lastMaterial.get(userId);
    const lm = last && db.materials.find((m) => m.id === last.materialId && !m.deletedAt);
    const lt = lm?.topicId ? db.topics.find((t) => t.id === lm.topicId) : undefined;
    const ls = lt && subjects.find((x) => x.slug === lt.subjectSlug);
    if (lm && lt && ls && topicVisible(db, lt)) {
      const siblings = db.materials.filter((m) => m.topicId === lt.id && !m.deletedAt);
      const topicsOf = visibleTopicsOf(db, ls.slug);
      lastMaterial = {
        materialId: lm.id, materialTitle: lm.title, materialNumber: siblings.findIndex((m) => m.id === lm.id) + 1, materialTotal: siblings.length,
        topicId: lt.id, topicNumber: topicsOf.findIndex((t) => t.id === lt.id) + 1, topicTitle: lt.title, subjectSlug: ls.slug, subjectCode: ls.code,
        platform: platformOfSubject(db, ls), completed: db.materialProgress.some((p) => p.userId === userId && p.materialId === lm.id),
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

export { authService, userService };
