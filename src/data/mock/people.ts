/**
 * DEMO DATA — fictional people, payments, notifications. None of this is real.
 */
import type { AppNotification, Certificate, Exam, Payment, RankingEntry, StudentRecord, User } from "@/types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysFromNow = (d: number, hour = 9) => {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() + d);
  x.setUTCHours(hour, 0, 0, 0);
  return x.toISOString();
};

export const demoStudent: User = {
  id: "u-demo-student",
  name: "Demo Student",
  email: "student@example.com",
  role: "STUDENT",
  locale: "en",
  createdAt: "2026-01-15T09:00:00.000Z",
};

export const demoAdmin: User = {
  id: "u-demo-admin",
  name: "Demo Admin",
  email: "admin@example.com",
  role: "ADMIN",
  locale: "en",
  createdAt: "2026-01-02T09:00:00.000Z",
};

export const students: StudentRecord[] = [
  { ...demoStudent, platforms: ["acca", "cima"], progress: 54, status: "active" },
  { id: "u-s2", name: "Aziza Karimova", email: "aziza@example.com", role: "STUDENT", locale: "uz", createdAt: "2026-02-03T10:00:00.000Z", platforms: ["acca"], progress: 71, status: "active" },
  { id: "u-s3", name: "Daniil Sokolov", email: "daniil@example.com", role: "STUDENT", locale: "ru", createdAt: "2026-02-18T10:00:00.000Z", platforms: ["cima"], progress: 33, status: "active" },
  { id: "u-s4", name: "Maria Lopez", email: "maria@example.com", role: "STUDENT", locale: "en", createdAt: "2026-03-07T10:00:00.000Z", platforms: ["fia", "acca"], progress: 48, status: "active" },
  { id: "u-s5", name: "Jasur Rahimov", email: "jasur@example.com", role: "STUDENT", locale: "uz", createdAt: "2026-03-21T10:00:00.000Z", platforms: ["acca"], progress: 12, status: "suspended" },
  { id: "u-t1", name: "Elena Petrova", email: "elena@example.com", role: "TEACHER", locale: "ru", createdAt: "2026-01-10T10:00:00.000Z", platforms: [], progress: 0, status: "active" },
];

export const ranking: Omit<RankingEntry, "isCurrentUser">[] = [
  { rank: 1, userId: "u-s2", name: "Aziza Karimova", points: 2480 },
  { rank: 2, userId: "u-s6", name: "Omar Haddad", points: 2310 },
  { rank: 3, userId: "u-s4", name: "Maria Lopez", points: 2195 },
  { rank: 4, userId: "u-s7", name: "Chen Wei", points: 2040 },
  { rank: 5, userId: "u-s3", name: "Daniil Sokolov", points: 1985 },
  { rank: 6, userId: "u-demo-student", name: "Demo Student", points: 1720 },
  { rank: 7, userId: "u-s8", name: "Sara Nilsson", points: 1655 },
  { rank: 8, userId: "u-s5", name: "Jasur Rahimov", points: 1210 },
];

export const certificates: Certificate[] = [
  { id: "c1", title: "ACCA Business and Technology (BT) — course completion", platform: "acca", status: "earned", issuedAt: "2026-06-12T00:00:00.000Z", progress: 100 },
  { id: "c2", title: "ACCA Management Accounting (MA) — course completion", platform: "acca", status: "in_progress", progress: 42 },
  { id: "c3", title: "CIMA Operational Level — course completion", platform: "cima", status: "in_progress", progress: 18 },
];

export const notifications: AppNotification[] = [
  { id: "n1", title: "New topic unlocked", body: "“Cost classification” is now available in Management Accounting.", createdAt: hoursAgo(2), read: false, target: { kind: "topic", id: "ma-cost-classification" } },
  { id: "n2", title: "Test result ready", body: "Your result for “Introduction to management accounting — quiz” is ready.", createdAt: hoursAgo(26), read: false, target: { kind: "result", id: "ma-introduction" } },
  { id: "n3", title: "Mock exam scheduled", body: "ACCA MA Mock Exam 1 starts soon. Check the date and duration.", createdAt: hoursAgo(50), read: true, target: { kind: "exam", id: "ex-ma-1" } },
  { id: "n4", title: "Certificate issued", body: "Your BT course completion certificate is available.", createdAt: hoursAgo(120), read: true, target: { kind: "certificate" } },
  { id: "n5", title: "Payment received", body: "Your payment for ACCA access was recorded.", createdAt: hoursAgo(300), read: true, target: { kind: "payment" } },
  { id: "n6", title: "Welcome to ACCA USA", body: "Start with your first topic whenever you are ready.", createdAt: hoursAgo(700), read: true, target: { kind: "none" } },
];

export const payments: Payment[] = [
  { id: "p1", description: "ACCA — full access (demo)", amountCents: 14900, currency: "USD", status: "paid", createdAt: "2026-03-01T10:00:00.000Z", studentName: "Demo Student" },
  { id: "p2", description: "CIMA — full access (demo)", amountCents: 16900, currency: "USD", status: "paid", createdAt: "2026-04-11T10:00:00.000Z", studentName: "Demo Student" },
  { id: "p3", description: "FIA — full access (demo)", amountCents: 2900, currency: "USD", status: "pending", createdAt: "2026-09-30T10:00:00.000Z", studentName: "Maria Lopez" },
  { id: "p4", description: "ACCA — full access (demo)", amountCents: 14900, currency: "USD", status: "refunded", createdAt: "2026-05-19T10:00:00.000Z", studentName: "Jasur Rahimov" },
  { id: "p5", description: "ACCA — full access (demo)", amountCents: 14900, currency: "USD", status: "failed", createdAt: "2026-08-02T10:00:00.000Z", studentName: "Daniil Sokolov" },
];

export const exams: Exam[] = [
  { id: "ex-ma-1", title: "ACCA MA — Mock Exam 1", platform: "acca", subjectSlug: "ma", startsAt: daysFromNow(3, 10), durationMinutes: 120, status: "scheduled" },
  { id: "ex-bt-1", title: "ACCA BT — Mock Exam 1", platform: "acca", subjectSlug: "bt", startsAt: daysFromNow(-20, 10), durationMinutes: 120, status: "completed", score: 76 },
  { id: "ex-fa-1", title: "ACCA FA — Mock Exam 1", platform: "acca", subjectSlug: "fa", startsAt: daysFromNow(10, 10), durationMinutes: 120, status: "scheduled" },
  { id: "ex-cima-e1", title: "CIMA E1 — Mock Exam 1", platform: "cima", subjectSlug: "cima-e1", startsAt: daysFromNow(14, 12), durationMinutes: 90, status: "scheduled" },
];

export const activitySeeds = [
  { id: "a1", kind: "topic" as const, title: "Cost classification", context: "Management Accounting", topicId: "ma-cost-classification", hoursAgo: 2, detail: "70%" },
  { id: "a2", kind: "test" as const, title: "Introduction quiz", context: "Management Accounting", testId: "ma-introduction", hoursAgo: 26, detail: "80%" },
  { id: "a3", kind: "topic" as const, title: "Governance, ethics and sustainability", context: "Business and Technology", topicId: "bt-governance-ethics-and-sustainability", hoursAgo: 52, detail: "40%" },
];

export { hoursAgo };
