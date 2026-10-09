import "server-only";
import { APP_MODE } from "@/lib/app-mode";
import { DATA_PROVIDER } from "@/lib/data-provider";
import type { Services } from "./contracts";
import * as memory from "./mock";
import * as prisma from "./prisma";

/**
 * Composition root — the ONLY place that names a data provider.
 *   DATA_PROVIDER=memory  in-memory demo database (demo mode only; resets on restart)
 *   DATA_PROVIDER=prisma  PostgreSQL through Prisma (required in production, optional in demo)
 * Routes and components import `services` only. Production safety (no memory provider, real storage, secrets) is
 * enforced at startup by `lib/env.ts`.
 */
if (APP_MODE === "production" && DATA_PROVIDER !== "prisma") {
  throw new Error("Production mode requires DATA_PROVIDER=prisma (the in-memory demo database is demo-only). See docs/DEPLOYMENT_MODES.md.");
}

const provider = DATA_PROVIDER === "prisma" ? prisma : memory;

export const services: Services = {
  auth: provider.authService,
  users: provider.userService,
  platforms: provider.platformService,
  subjects: provider.subjectService,
  topics: provider.topicService,
  materials: provider.materialService,
  mediaText: provider.mediaTextService,
  enrollments: provider.enrollmentService,
  questions: provider.questionService,
  tests: provider.testService,
  testResults: provider.testResultService,
  exams: provider.examService,
  payments: provider.paymentService,
  progress: provider.progressService,
  ranking: provider.rankingService,
  certificates: provider.certificateService,
  notifications: provider.notificationService,
  dashboard: provider.dashboardService,
  stats: provider.statsService,
  search: provider.searchService,
};

export type { Services, Session } from "./contracts";
