import "server-only";
import { randomUUID } from "node:crypto";
import type { AppNotification, Difficulty, IssuedCertificate, Material, MaterialKind, PlatformSlug, Role, TestResult, Topic, UserStatus, Locale } from "@/types";
import { platforms as seedPlatforms, subjects as seedSubjects, allTopics as seedTopics, materials as seedMaterials } from "@/data/mock/catalog";
import { btQuestions, questionBank, testRecords } from "@/data/mock/assessments";
import { DEMO_STUDENT_ID, notifications as seedNotifications, seedUsers } from "@/data/mock/people";

/**
 * In-memory DEMO database for the demo data provider.
 * - Resets when the server restarts (by design). Never extend this into a fake production DB.
 * - Passwords exist ONLY as salted scrypt hashes (`passwordHash`); there is no plaintext anywhere.
 * - Records are soft-deleted via `deletedAt`; services filter them out of student views.
 */

export interface UserRec {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  locale: Locale;
  passwordHash: string | null;
  /** bumped on password reset / suspension / role change → revokes all older session tokens */
  tokenVersion: number;
  createdAt: string;
  deletedAt?: string;
}
export interface PlatformRec { slug: PlatformSlug; name: string; fullName: string; deletedAt?: string }
export interface LevelRec { id: string; platform: PlatformSlug; name: string; order: number }
export interface SubjectRec { slug: string; code: string; name: string; levelId: string; createdAt: string; deletedAt?: string }
export interface TopicRec extends Omit<Topic, "archived"> { createdAt: string; deletedAt?: string }
export interface MaterialRec extends Omit<Material, "archived" | "meta"> { deletedAt?: string }
export interface QuestionRec {
  id: string;
  subjectSlug: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
  points: number;
  difficulty: Difficulty;
  topicId?: string;
  tags: string[];
  imageId?: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
export interface TestRec {
  id: string;
  subjectSlug: string;
  topicId?: string;
  title: string;
  durationMinutes: number;
  passMark: number;
  questionIds: string[];
  description: string;
  /** 0 = unlimited */
  attemptsAllowed: number;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  published: boolean;
  publishedAt?: string;
  createdAt: string;
  deletedAt?: string;
}
export interface AttemptRec {
  id: string;
  userId: string;
  testId: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  startedAt: string;
  deadlineAt: string;
  answers: Record<string, string>;
  flagged: string[];
  currentIndex: number;
  elapsedSeconds: number;
  submittedAt?: string;
  result?: TestResult;
}
export interface ActivityRec { id: string; userId: string; kind: "topic" | "test" | "enroll"; title: string; context: string; href: string; at: string; detail?: string }
export interface ResetTokenRec { tokenHash: string; userId: string; expiresAt: number; usedAt?: number }
export interface ProgressEntry { percent: number; updatedAt: string }

export interface Db {
  users: UserRec[];
  platforms: PlatformRec[];
  levels: LevelRec[];
  subjects: SubjectRec[];
  topics: TopicRec[];
  materials: MaterialRec[];
  questions: QuestionRec[];
  tests: TestRec[];
  enrollments: { userId: string; platform: PlatformSlug; createdAt: string }[];
  progress: Map<string, Map<string, ProgressEntry>>;
  /** Student + Material completion (PostgreSQL later: MaterialProgress(userId, materialId, completedAt)). */
  materialProgress: { userId: string; materialId: string; completedAt: string }[];
  /** userId -> last opened material (PostgreSQL later: User.lastMaterialId + lastMaterialAt). */
  lastMaterial: Map<string, { materialId: string; at: string }>;
  certificates: IssuedCertificate[];
  certificateSeq: number;
  attempts: AttemptRec[];
  notifications: Map<string, AppNotification[]>;
  activity: ActivityRec[];
  resetTokens: ResetTokenRec[];
}

const g = globalThis as unknown as { __accaDb?: Db };

/** AU-<year>-<6 digits> */
export const certificateNumber = (d: Date, seq: number) => `AU-${d.getUTCFullYear()}-${String(seq).padStart(6, "0")}`;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const ts = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "item";
}

function seed(): Db {
  const created = "2026-01-10T10:00:00.000Z";
  const difficultyById: Record<string, Difficulty> = {
    "q-total-cost": "hard", "q-prime-cost": "medium", "q-period-cost": "hard", "q-overhead": "medium",
    "q-step-cost": "medium", "q-semi-variable": "medium", "q-direct-cost": "easy", "q-fixed-cost": "easy",
    "q-variable-behaviour": "easy", "q-cost-unit": "easy",
  };
  const db: Db = {
    users: seedUsers.map((u) => ({ ...u, tokenVersion: 0 })),
    platforms: seedPlatforms.map((p) => ({ slug: p.slug, name: p.name, fullName: p.fullName })),
    levels: seedPlatforms.flatMap((p) => p.levels.map((l) => ({ id: l.id, platform: l.platform, name: l.name, order: l.order }))),
    subjects: seedSubjects.map((s) => ({ slug: s.slug, code: s.code, name: s.name, levelId: s.levelId, createdAt: created })),
    topics: seedTopics.map((t) => ({ ...t, createdAt: created })),
    materials: seedMaterials.map(({ meta: _meta, ...m }) => m),
    questions: questionBank.map((q) => ({
      id: q.id,
      subjectSlug: "ma",
      text: q.text,
      options: q.options,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
      points: q.id === "q-total-cost" ? 2 : 1,
      difficulty: difficultyById[q.id] ?? "easy",
      tags: [] as string[],
      status: "published" as const,
      createdAt: created,
      updatedAt: created,
    })).concat(btQuestions.map((q) => ({
      id: q.id, subjectSlug: "bt", topicId: q.topicId, text: q.text, options: q.options, correctOptionId: q.correctOptionId, explanation: q.explanation,
      points: 1, difficulty: q.difficulty, tags: q.tags, status: "published" as const, createdAt: created, updatedAt: created,
    }))),
    tests: testRecords.map((t) => ({
      ...t, description: "", attemptsAllowed: 0, randomizeQuestions: false, randomizeAnswers: false, published: true, publishedAt: created, createdAt: created,
    })),
    enrollments: [
      { userId: DEMO_STUDENT_ID, platform: "acca", createdAt: hoursAgo(900) },
    ],
    progress: new Map(),
    materialProgress: [],
    lastMaterial: new Map(),
    certificates: [],
    certificateSeq: 0,
    attempts: [],
    notifications: new Map(),
    activity: [],
    resetTokens: [],
  };

  const p = new Map<string, ProgressEntry>();
  const set = (id: string, percent: number, h: number) => p.set(id, { percent, updatedAt: hoursAgo(h) });
  set("ma-introduction-to-management-accounting", 100, 30);
  set("ma-cost-classification", 70, 2);
  set("bt-business-organisations-and-their-stakeholders", 100, 200);
  set("bt-business-environment", 100, 150);
  set("bt-organisational-structure-and-culture", 100, 100);
  set("bt-governance-ethics-and-sustainability", 40, 52);
  set("fa-the-context-and-purpose-of-financial-reporting", 100, 300);
  set("fa-double-entry-bookkeeping", 30, 80);
  db.progress.set(DEMO_STUDENT_ID, p);

  // One demo certificate issued by the administrator (the student has not completed BT, so it is NOT auto-earned).
  db.certificateSeq = 1;
  db.certificates.push({
    id: "cert-demo-bt", number: certificateNumber(new Date(Date.now() - 90 * 86_400_000), 1), userId: DEMO_STUDENT_ID, studentName: "Demo Student",
    platform: "acca", subjectSlug: "bt", subjectCode: "BT", subjectName: "Business and Technology", title: "ACCA BT — Business and Technology",
    issuedAt: new Date(Date.now() - 90 * 86_400_000).toISOString(), status: "issued", source: "admin",
  });

  db.notifications.set(DEMO_STUDENT_ID, seedNotifications.map((n) => ({ ...n })));
  db.activity.push(
    { id: "a1", userId: DEMO_STUDENT_ID, kind: "topic", title: "Cost classification", context: "Management Accounting", href: "/topic/ma-cost-classification", at: hoursAgo(2), detail: "70%" },
    { id: "a2", userId: DEMO_STUDENT_ID, kind: "topic", title: "Introduction to management accounting", context: "Management Accounting", href: "/topic/ma-introduction-to-management-accounting", at: hoursAgo(30), detail: "100%" },
    { id: "a3", userId: DEMO_STUDENT_ID, kind: "topic", title: "Governance, ethics and sustainability", context: "Business and Technology", href: "/topic/bt-governance-ethics-and-sustainability", at: hoursAgo(52), detail: "40%" },
  );
  return db;
}

export function getDb(): Db {
  return (g.__accaDb ??= seed());
}

/* ---------- visibility helpers (soft delete cascades at read time) ---------- */

export function subjectVisible(db: Db, s: SubjectRec | undefined): s is SubjectRec {
  if (!s || s.deletedAt) return false;
  const level = db.levels.find((l) => l.id === s.levelId);
  const platform = level && db.platforms.find((p) => p.slug === level.platform);
  return !!platform && !platform.deletedAt;
}
export const platformOfSubject = (db: Db, s: SubjectRec): PlatformSlug => db.levels.find((l) => l.id === s.levelId)?.platform ?? "acca";

export function topicVisible(db: Db, t: TopicRec | undefined): t is TopicRec {
  return !!t && !t.deletedAt && subjectVisible(db, db.subjects.find((s) => s.slug === t.subjectSlug));
}

export const nowIso = ts;
export const kindLabel = (k: MaterialKind) => k;

export function pushActivity(db: Db, a: Omit<ActivityRec, "id" | "at">) {
  db.activity.unshift({ ...a, id: newId("act"), at: ts() });
  if (db.activity.length > 500) db.activity.length = 500;
}

/** Notify every ACTIVE student enrolled in the platform (e.g. new material / test / topic). */
export function notifyEnrolled(db: Db, platform: PlatformSlug, n: Omit<AppNotification, "id" | "createdAt" | "read">) {
  const ids = new Set(db.enrollments.filter((e) => e.platform === platform).map((e) => e.userId));
  for (const u of db.users) if (ids.has(u.id) && u.role === "STUDENT" && u.status === "active" && !u.deletedAt) pushNotification(db, u.id, n);
}

/** Notify every active administrator. */
export function notifyAdmins(db: Db, n: Omit<AppNotification, "id" | "createdAt" | "read">) {
  for (const u of db.users) if (u.role === "ADMIN" && u.status === "active" && !u.deletedAt) pushNotification(db, u.id, n);
}

export function userNotifications(db: Db, userId: string): AppNotification[] {
  let list = db.notifications.get(userId);
  if (!list) {
    list = [];
    db.notifications.set(userId, list);
  }
  return list;
}

export function pushNotification(db: Db, userId: string, n: Omit<AppNotification, "id" | "createdAt" | "read">) {
  userNotifications(db, userId).unshift({ ...n, id: newId("n"), createdAt: ts(), read: false });
}

export function userProgress(db: Db, userId: string): Map<string, ProgressEntry> {
  let m = db.progress.get(userId);
  if (!m) {
    m = new Map();
    db.progress.set(userId, m);
  }
  return m;
}
