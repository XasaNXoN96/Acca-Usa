import "server-only";
import type { AppNotification, AttemptDraft, TestResult } from "@/types";
import { notifications } from "@/data/mock/people";

/**
 * In-memory store backing the MOCK services only. It resets on server restart and is
 * NOT shared between instances — that is intentional: it exists to make the UI
 * flows demonstrable until PostgreSQL + Prisma replace it. Never extend this for production.
 */
interface MockStore {
  topicProgress: Map<string, Record<string, number>>;
  attempts: Map<string, TestResult & { userId: string }>;
  drafts: Map<string, AttemptDraft>;
  notifications: Map<string, AppNotification[]>;
}

const g = globalThis as unknown as { __accaMockStore?: MockStore };

export const store: MockStore = (g.__accaMockStore ??= {
  topicProgress: new Map(),
  attempts: new Map(),
  drafts: new Map(),
  notifications: new Map(),
});

export const seedProgress = (): Record<string, number> => ({
  "ma-introduction-to-management-accounting": 100,
  "ma-cost-classification": 70,
  "bt-business-organisations-and-their-stakeholders": 100,
  "bt-business-environment": 100,
  "bt-organisational-structure-and-culture": 100,
  "bt-governance-ethics-and-sustainability": 40,
  "fa-the-context-and-purpose-of-financial-reporting": 100,
  "fa-double-entry-bookkeeping": 30,
});

export function getUserProgress(userId: string): Record<string, number> {
  let p = store.topicProgress.get(userId);
  if (!p) {
    p = seedProgress();
    store.topicProgress.set(userId, p);
  }
  return p;
}

export function getUserNotifications(userId: string): AppNotification[] {
  let n = store.notifications.get(userId);
  if (!n) {
    n = notifications.map((x) => ({ ...x }));
    store.notifications.set(userId, n);
  }
  return n;
}
