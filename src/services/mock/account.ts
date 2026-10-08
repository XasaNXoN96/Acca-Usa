import "server-only";
import type { AuthService, NotificationService, PaymentService, UserService, DashboardService } from "../contracts";
import type { DashboardOverview, Enrollment } from "@/types";
import { demoAdmin, demoStudent, payments, students } from "@/data/mock/people";
import { getSubject, getTopic } from "@/data/mock/catalog";
import { getUserNotifications, getUserProgress } from "./store";
import { certificateService, progressService, rankingService, testService } from "./learning";

export const authService: AuthService = {
  /**
   * DEMO ONLY. There is no authentication yet — this returns a fixed demo identity and
   * flags it so the UI can show a notice. Replace with Auth.js `auth()` next stage.
   */
  async getSession(role = "STUDENT") {
    return { user: role === "ADMIN" ? demoAdmin : demoStudent, isDemo: true };
  },
};

export const userService: UserService = {
  async getById(id) {
    return [demoStudent, demoAdmin, ...students].find((u) => u.id === id) ?? null;
  },
  async listStudents() {
    return students;
  },
  async updateLocale() {
    // Persisted with the user record once the database is connected.
  },
};

export const paymentService: PaymentService = {
  async listForUser(userId) {
    return userId === demoStudent.id ? payments.filter((p) => p.studentName === "Demo Student") : [];
  },
  async listAll() {
    return payments;
  },
};

export const notificationService: NotificationService = {
  async list(userId) {
    return [...getUserNotifications(userId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async unreadCount(userId) {
    return getUserNotifications(userId).filter((n) => !n.read).length;
  },
  async markRead(userId, id) {
    const n = getUserNotifications(userId).find((x) => x.id === id);
    if (n) n.read = true;
  },
  async markAllRead(userId) {
    getUserNotifications(userId).forEach((n) => (n.read = true));
  },
};

export const dashboardService: DashboardService = {
  async getOverview(userId): Promise<DashboardOverview> {
    const [platformProgress, activity, topRank, certs, unread, ma] = await Promise.all([
      progressService.getPlatformProgress(userId),
      progressService.recentActivity(userId),
      rankingService.top(userId, 5),
      certificateService.listForUser(userId),
      notificationService.unreadCount(userId),
      testService.listForSubject("ma", userId),
    ]);

    const enrollments: Enrollment[] = [
      { platform: "acca", status: "active", progress: platformProgress.acca },
      { platform: "cima", status: "active", progress: platformProgress.cima },
      { platform: "fia", status: "not_enrolled", progress: 0, priceLabel: "$29" },
    ];
    const active = enrollments.filter((e) => e.status === "active");
    const progress = getUserProgress(userId);
    const topicIds = Object.keys(progress);
    const completed = topicIds.filter((id) => (progress[id] ?? 0) >= 100).length;
    const inProgress = topicIds.filter((id) => {
      const p = progress[id] ?? 0;
      return p > 0 && p < 100;
    }).length;
    const total = 25;

    const continueLearning = ["ma-cost-classification", "bt-governance-ethics-and-sustainability"].flatMap((id) => {
      const t = getTopic(id);
      if (!t) return [];
      return [{ topicId: id, topicTitle: t.title, subjectName: getSubject(t.subjectSlug)?.name ?? "", progress: progress[id] ?? 0 }];
    });

    const user = (await authServiceUser(userId)) ?? demoStudent;
    return {
      user,
      stats: {
        enrolledCourses: active.length,
        completedTopics: completed,
        learningHours: 45,
        overallProgress: active.length ? Math.round(active.reduce((a, e) => a + e.progress, 0) / active.length) : 0,
      },
      enrollments,
      continueLearning,
      recentActivity: activity,
      progressBreakdown: { completed, inProgress, notStarted: Math.max(0, total - completed - inProgress), total },
      ranking: topRank,
      tests: ma.map((test, i) => ({
        test,
        subjectName: "Management Accounting",
        status: i === 0 ? ("upcoming" as const) : ("recent" as const),
        score: test.bestScore,
        dateISO: new Date().toISOString(),
      })),
      certificates: certs,
      unreadNotifications: unread,
    };
  },
};

async function authServiceUser(userId: string) {
  return userService.getById(userId);
}
