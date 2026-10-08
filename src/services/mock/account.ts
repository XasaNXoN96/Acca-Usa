import "server-only";
import type { DashboardService, NotificationService, PaymentService } from "../contracts";
import type { DashboardOverview, PlatformSlug } from "@/types";
import { DEMO_STUDENT_ID, payments } from "@/data/mock/people";
import { getDb, platformOfSubject, userNotifications, userProgress } from "./db";
import { platformProgress, visibleSubjects, visibleTopicsOf } from "./calc";
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
    const pct = (id: string) => progress.get(id)?.percent ?? 0;
    const completed = topics.filter(({ t }) => pct(t.id) >= 100);
    const started = topics.filter(({ t }) => pct(t.id) > 0 && pct(t.id) < 100);
    const minutes = completed.reduce((a, { t }) => a + t.durationMinutes, 0);

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

    return {
      user: toUser(rec),
      stats: {
        enrolledCourses: active.length,
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
