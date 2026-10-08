/**
 * DEMO DATA — fictional people, payments, notifications. None of this is real.
 */
import type { AppNotification, Exam, Locale, Payment, PlatformSlug, RankingEntry, Role, UserStatus } from "@/types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysFromNow = (d: number, hour = 9) => {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() + d);
  x.setUTCHours(hour, 0, 0, 0);
  return x.toISOString();
};

/**
 * Seed accounts for DEMO MODE. Only salted scrypt hashes live here — never plaintext.
 * The matching demo credentials are published on the login page while APP_MODE=demo
 * (see docs/DEMO_MODE.md). They exist only in the in-memory demo store.
 */
export interface SeedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  locale: Locale;
  createdAt: string;
  /** null = account has no password yet (use "forgot password" to set one) */
  passwordHash: string | null;
}

export const DEMO_STUDENT_ID = "u-demo-student";
export const DEMO_ADMIN_ID = "u-demo-admin";

export const demoCredentials = [
  { role: "STUDENT" as const, email: "student@example.com", password: "Student-Demo1" },
  { role: "ADMIN" as const, email: "admin@example.com", password: "Admin-Demo1" },
];

export const seedUsers: SeedUser[] = [
  { id: DEMO_STUDENT_ID, name: "Demo Student", email: "student@example.com", role: "STUDENT", status: "active", locale: "en", createdAt: "2026-01-15T09:00:00.000Z", passwordHash: "s1$cg06V5H7ikr2boLxwpc79A$kG-cqFIVBV-EEet6L9HA8EJauhlZK4b2A1RUUNQPp4HIV8i1X1VlPGgZcBa3AOOqZptwaklxKcqVzcF3bGnTLw" },
  { id: DEMO_ADMIN_ID, name: "Demo Admin", email: "admin@example.com", role: "ADMIN", status: "active", locale: "en", createdAt: "2026-01-02T09:00:00.000Z", passwordHash: "s1$9vWD23uRPc5ZLOFECRrxQQ$3k_ulf6Btq3aH9hFPYAHsKLuiMW2Yv99-5E-SR6kFrCuwTkIljI2c9p-LpX6ilNnaxxmmeu7XsyNbd8OKEht2A" },
  { id: "u-s2", name: "Aziza Karimova", email: "aziza@example.com", role: "STUDENT", status: "active", locale: "uz", createdAt: "2026-02-03T10:00:00.000Z", passwordHash: null },
  { id: "u-s3", name: "Daniil Sokolov", email: "daniil@example.com", role: "STUDENT", status: "active", locale: "ru", createdAt: "2026-02-18T10:00:00.000Z", passwordHash: null },
  { id: "u-s4", name: "Maria Lopez", email: "maria@example.com", role: "STUDENT", status: "active", locale: "en", createdAt: "2026-03-07T10:00:00.000Z", passwordHash: null },
  { id: "u-s5", name: "Jasur Rahimov", email: "jasur@example.com", role: "STUDENT", status: "suspended", locale: "uz", createdAt: "2026-03-21T10:00:00.000Z", passwordHash: null },
];

/** Fictional enrolment/progress for the non-login demo students (admin lists only). */
export const seedStudentSummary: Record<string, { platforms: PlatformSlug[]; progress: number }> = {
  [DEMO_STUDENT_ID]: { platforms: ["acca"], progress: 54 },
  "u-s2": { platforms: ["acca"], progress: 71 },
  "u-s3": { platforms: ["fia"], progress: 33 },
  "u-s4": { platforms: ["fia", "acca"], progress: 48 },
  "u-s5": { platforms: ["acca"], progress: 12 },
};

export const ranking: Omit<RankingEntry, "isCurrentUser">[] = [
  { rank: 1, userId: "u-s2", name: "Aziza Karimova", points: 2480 },
  { rank: 2, userId: "u-s6", name: "Omar Haddad", points: 2310 },
  { rank: 3, userId: "u-s4", name: "Maria Lopez", points: 2195 },
  { rank: 4, userId: "u-s7", name: "Chen Wei", points: 2040 },
  { rank: 5, userId: "u-s3", name: "Daniil Sokolov", points: 1985 },
  { rank: 6, userId: DEMO_STUDENT_ID, name: "Demo Student", points: 1720 },
  { rank: 7, userId: "u-s8", name: "Sara Nilsson", points: 1655 },
  { rank: 8, userId: "u-s5", name: "Jasur Rahimov", points: 1210 },
];


export const notifications: AppNotification[] = [
  { id: "n1", code: "topic_unlocked", params: { topic: "Cost classification" }, createdAt: hoursAgo(2), read: false, target: { kind: "topic", id: "ma-cost-classification" } },
  { id: "n2", code: "result_ready", params: { test: "Introduction to management accounting — quiz" }, createdAt: hoursAgo(26), read: false, target: { kind: "result", id: "ma-introduction" } },
  { id: "n3", code: "exam_scheduled", params: { exam: "ACCA MA — Mock Exam 1" }, createdAt: hoursAgo(50), read: true, target: { kind: "exam", id: "ex-ma-1" } },
  { id: "n4", code: "certificate_issued", params: { title: "BT" }, createdAt: hoursAgo(120), read: true, target: { kind: "certificate", id: "cert-demo-bt" } },
  { id: "n5", code: "payment_received", createdAt: hoursAgo(300), read: true, target: { kind: "payment" } },
  { id: "n6", code: "welcome", createdAt: hoursAgo(700), read: true, target: { kind: "none" } },
];

export const payments: Payment[] = [
  { id: "p1", description: "ACCA — full access (demo)", amountCents: 14900, currency: "USD", status: "paid", createdAt: "2026-03-01T10:00:00.000Z", studentName: "Demo Student" },
  { id: "p3", description: "FIA — full access (demo)", amountCents: 2900, currency: "USD", status: "pending", createdAt: "2026-09-30T10:00:00.000Z", studentName: "Maria Lopez" },
  { id: "p4", description: "ACCA — full access (demo)", amountCents: 14900, currency: "USD", status: "refunded", createdAt: "2026-05-19T10:00:00.000Z", studentName: "Jasur Rahimov" },
  { id: "p5", description: "ACCA — full access (demo)", amountCents: 14900, currency: "USD", status: "failed", createdAt: "2026-08-02T10:00:00.000Z", studentName: "Daniil Sokolov" },
];

export const exams: Exam[] = [
  { id: "ex-ma-1", title: "ACCA MA — Mock Exam 1", platform: "acca", subjectSlug: "ma", startsAt: daysFromNow(3, 10), durationMinutes: 120, status: "scheduled" },
  { id: "ex-bt-1", title: "ACCA BT — Mock Exam 1", platform: "acca", subjectSlug: "bt", startsAt: daysFromNow(-20, 10), durationMinutes: 120, status: "completed", score: 76 },
  { id: "ex-fa-1", title: "ACCA FA — Mock Exam 1", platform: "acca", subjectSlug: "fa", startsAt: daysFromNow(10, 10), durationMinutes: 120, status: "scheduled" },
];

export const activitySeeds = [
  { id: "a1", kind: "topic" as const, title: "Cost classification", context: "Management Accounting", topicId: "ma-cost-classification", hoursAgo: 2, detail: "70%" },
  { id: "a2", kind: "test" as const, title: "Introduction quiz", context: "Management Accounting", testId: "ma-introduction", hoursAgo: 26, detail: "80%" },
  { id: "a3", kind: "topic" as const, title: "Governance, ethics and sustainability", context: "Business and Technology", topicId: "bt-governance-ethics-and-sustainability", hoursAgo: 52, detail: "40%" },
];

export { hoursAgo };
