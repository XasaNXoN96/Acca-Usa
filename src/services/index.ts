import "server-only";
import type { Services } from "./contracts";
import { authService, dashboardService, notificationService, paymentService, userService } from "./mock/account";
import { materialService, platformService, searchService, subjectService, topicService } from "./mock/catalog";
import { certificateService, examService, progressService, rankingService, testService } from "./mock/learning";

/**
 * Composition root. Swap the mock implementations for Prisma-backed ones here
 * (one line per service) when the backend block lands. Routes and components import
 * `services` only — never the mock modules directly.
 */
export const services: Services = {
  auth: authService,
  users: userService,
  platforms: platformService,
  subjects: subjectService,
  topics: topicService,
  materials: materialService,
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
