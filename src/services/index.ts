import "server-only";
import { APP_MODE } from "@/lib/app-mode";
import type { Services } from "./contracts";
import { dashboardService, notificationService, paymentService } from "./mock/account";
import { authService, userService } from "./mock/auth-users";
import { enrollmentService, materialService, platformService, searchService, subjectService, topicService } from "./mock/catalog";
import { questionService, testService } from "./mock/assessment";
import { certificateService, examService, progressService, rankingService } from "./mock/learning";

/**
 * Composition root. Demo mode wires the in-memory demo data provider. Production mode will
 * wire Prisma-backed services (one line per service) — until they exist it refuses to start
 * instead of silently serving demo data. Routes and components import `services` only.
 */
if (APP_MODE !== "demo") {
  throw new Error("Production data providers are not implemented yet. Set NEXT_PUBLIC_APP_MODE=demo (see docs/DEMO_MODE.md).");
}

export const services: Services = {
  auth: authService,
  users: userService,
  platforms: platformService,
  subjects: subjectService,
  topics: topicService,
  materials: materialService,
  enrollments: enrollmentService,
  questions: questionService,
  tests: testService,
  exams: examService,
  payments: paymentService,
  progress: progressService,
  ranking: rankingService,
  certificates: certificateService,
  notifications: notificationService,
  dashboard: dashboardService,
  search: searchService,
};

export type { Services, Session } from "./contracts";
