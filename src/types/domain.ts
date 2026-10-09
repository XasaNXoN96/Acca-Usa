/**
 * Domain types shared by UI, services and (later) Prisma mappers.
 * Dates are ISO-8601 UTC strings; format them at the edge with lib/format.ts.
 * Nothing here ever carries password material.
 */

export type Role = "STUDENT" | "ADMIN";
export type PlatformSlug = "acca" | "fia";
export type Locale = "en" | "ru" | "uz";
export type UserStatus = "active" | "suspended";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  locale: Locale;
  createdAt: string;
}

export interface Level {
  id: string;
  platform: PlatformSlug;
  name: string;
  order: number;
}

export interface Platform {
  slug: PlatformSlug;
  name: string;
  fullName: string;
  /** Price of full access in USD cents. 0 = free enrolment. */
  priceCents: number;
  levels: Level[];
  archived?: boolean;
}

export interface Subject {
  /** URL slug, e.g. "ma". Unique across platforms. */
  slug: string;
  code: string;
  name: string;
  platform: PlatformSlug;
  levelId: string;
  topicCount: number;
  testCount: number;
  archived?: boolean;
}

export type TopicStatus = "completed" | "in_progress" | "unlocked" | "locked";

export interface Topic {
  id: string;
  subjectSlug: string;
  order: number;
  title: string;
  lessonCount: number;
  durationMinutes: number;
  description: string;
  keyPoints: string[];
  archived?: boolean;
}

export interface TopicWithStatus extends Topic {
  status: TopicStatus;
  /** 0–100 */
  progress: number;
}

export const materialKinds = ["video", "pdf", "notes", "audio", "slides", "image", "file", "book"] as const;
export type MaterialKind = (typeof materialKinds)[number];

export interface Material {
  id: string;
  subjectSlug: string;
  topicId?: string;
  kind: MaterialKind;
  title: string;
  /** Human label, e.g. "2.4 MB · video/mp4". Derived from the stored file. */
  meta: string;
  /** Reference to a StorageProvider object. Served through /api/files/[id] after a session check. */
  fileId?: string;
  fileMime?: string;
  /** Media-pipeline state of the attached file; anything but READY is not playable yet. */
  fileStatus?: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "REJECTED";
  /** Text content for kind = "notes" (rendered as plain text, never as HTML). */
  body?: string;
  createdAt: string;
  archived?: boolean;
}

export const difficulties = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof difficulties)[number];

export interface QuestionOption {
  id: string;
  text: string;
}

/** Admin view of a bank question — includes the answer. Never sent to students before submission. */
export const questionStatuses = ["draft", "published", "archived"] as const;
export type QuestionStatus = (typeof questionStatuses)[number];

export interface BankQuestion {
  id: string;
  subjectSlug: string;
  /** optional: a question may belong to a whole subject or to one topic */
  topicId?: string;
  tags: string[];
  /** Storage file id of an optional illustration (served through /api/files/[id]). */
  imageId?: string;
  /** "archived" = soft-deleted; drafts can be edited freely but are not selectable for tests. */
  status: QuestionStatus;
  createdAt: string;
  updatedAt: string;
  text: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  points: number;
  difficulty: Difficulty;
  archived?: boolean;
}

export interface TestSummary {
  id: string;
  subjectSlug: string;
  topicId?: string;
  title: string;
  description: string;
  questionCount: number;
  totalPoints: number;
  durationMinutes: number;
  passMark: number;
  /** 0 = unlimited */
  attemptsAllowed: number;
  /** Finished attempts of the current user (only set when a user is known). */
  attemptsUsed?: number;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  published: boolean;
  publishedAt?: string;
  /** Best score for the current user in %, if attempted. */
  bestScore?: number;
  archived?: boolean;
}

/** What the browser receives. Correct answers and explanations never leave the server before submission. */
export interface PublicQuestion {
  id: string;
  text: string;
  /** optional illustration (storage id, served through /api/files after an enrolment check) */
  imageId?: string;
  options: QuestionOption[];
  points: number;
}

export interface TestForAttempt extends TestSummary {
  questions: PublicQuestion[];
}

/** questionId -> optionId */
export type AnswerMap = Record<string, string>;

/** In-progress attempt state, owned by the server (deadline is authoritative). */
export interface AttemptDraft {
  testId: string;
  answers: AnswerMap;
  flagged: string[];
  currentIndex: number;
  /** Seconds elapsed on the SERVER clock when the page was rendered / the draft saved. */
  elapsedSeconds: number;
}

export interface ReviewItem {
  questionId: string;
  text: string;
  options: QuestionOption[];
  selectedOptionId: string | null;
  correctOptionId: string;
  explanation: string;
  isCorrect: boolean;
  flagged: boolean;
  points: number;
}

export interface TestResult {
  attemptId: string;
  testId: string;
  testTitle: string;
  subjectSlug: string;
  subjectName: string;
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  earnedPoints: number;
  totalPoints: number;
  /** 0–100, points based */
  scorePercent: number;
  passMark: number;
  passed: boolean;
  timeSpentSeconds: number;
  submittedAt: string;
  review: ReviewItem[];
  /** Subject progress before/after this attempt — drives the "progress update" block. */
  progressBefore: number;
  progressAfter: number;
}

export interface ResultListItem {
  attemptId: string;
  testId: string;
  testTitle: string;
  subjectName: string;
  scorePercent: number;
  passed: boolean;
  submittedAt: string;
}

export interface Enrollment {
  platform: PlatformSlug;
  /** "active" = the learner has access right now (FREE / ACTIVE and not expired). */
  status: "active" | "not_enrolled";
  /** Stored enrolment state, if any: lets the UI offer "renew" for EXPIRED and explain REVOKED. */
  access?: "FREE" | "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt?: string;
  priceCents: number;
  progress: number;
}

export interface ActivityItem {
  id: string;
  kind: "topic" | "test" | "enroll";
  title: string;
  context: string;
  href: string;
  occurredAt: string;
  detail?: string;
}

export interface SubjectProgressItem {
  subjectSlug: string;
  code: string;
  name: string;
  platform: PlatformSlug;
  percent: number;
  completedTopics: number;
  totalTopics: number;
}

/** The material the learner opened most recently (drives "Continue learning"). */
export interface LastMaterial {
  materialId: string;
  materialTitle: string;
  materialNumber: number;
  materialTotal: number;
  topicId: string;
  topicNumber: number;
  topicTitle: string;
  subjectSlug: string;
  subjectCode: string;
  platform: PlatformSlug;
  completed: boolean;
}

export interface DashboardOverview {
  user: User;
  stats: { enrolledCourses: number; enrolledSubjects: number; completedTopics: number; learningHours: number; overallProgress: number };
  lastMaterial: LastMaterial | null;
  subjectProgress: SubjectProgressItem[];
  enrollments: Enrollment[];
  continueLearning: { topicId: string; topicTitle: string; subjectName: string; platform: PlatformSlug; progress: number }[];
  recentActivity: ActivityItem[];
  progressBreakdown: { completed: number; inProgress: number; notStarted: number; total: number };
  ranking: RankingEntry[];
  recentResults: ResultListItem[];
  availableTests: { test: TestSummary; subjectName: string }[];
  certificates: Certificate[];
  unreadNotifications: number;
}

/** Filters of the admin statistics page. `from` / `to` are ISO dates (YYYY-MM-DD), inclusive. */
export interface StatsFilter {
  platform?: PlatformSlug;
  subjectSlug?: string;
  from: string;
  to: string;
}

export interface AdminStats {
  filter: StatsFilter;
  totals: {
    students: number;
    activeStudents: number;
    subjects: number;
    topics: number;
    materials: number;
    tests: number;
    attempts: number;
    /** null = no attempts in the selected range (nothing to average) */
    passRate: number | null;
    avgScore: number | null;
    completedMaterials: number;
    /** New enrolments created in the range (platforms in scope). */
    enrollments: number;
    /** Topics completed in the range. */
    completedTopics: number;
    /** Certificates issued in the range. */
    certificates: number;
    /** Payments confirmed (PAID) in the range, and their sum in USD cents. Refunds are not netted out. */
    payments: number;
    revenueCents: number;
  };
  /** One bucket per day (short ranges) or month (long ranges), oldest first. */
  activity: { key: string; label: string; activeStudents: number; attempts: number; completedMaterials: number }[];
  activityBucket: "day" | "month";
  testPerformance: { testId: string; title: string; subjectCode: string; attempts: number; avgScore: number; passRate: number }[];
  subjectProgress: { subjectSlug: string; code: string; name: string; platform: PlatformSlug; students: number; avgProgress: number }[];
  passFail: { passed: number; failed: number };
}

/**
 * One row of the ranking. Deliberately has NO email / user id: other learners appear as "First L." and only the
 * current user sees their own full name.
 */
export interface RankingEntry {
  rank: number;
  name: string;
  /** Sum of the best score (%) per test taken in the selected scope. */
  points: number;
  testsCompleted: number;
  /** Learning progress in the selected scope (0–100). */
  progress: number;
  isCurrentUser: boolean;
}

export interface RankingResult {
  entries: RankingEntry[];
  /** The current user's row, also when it is not among `entries`. */
  me: RankingEntry | null;
  total: number;
}

/** Student-facing certificate row: earned, revoked, or the learner's progress towards one. */
export interface Certificate {
  id: string;
  title: string;
  platform: PlatformSlug;
  status: "earned" | "in_progress" | "revoked";
  issuedAt?: string;
  progress: number;
  number?: string;
  subjectSlug?: string;
}

/** A course-completion certificate record (PostgreSQL later: one row per student + subject). */
export interface IssuedCertificate {
  id: string;
  /** Human readable, e.g. AU-2026-000012 */
  number: string;
  userId: string;
  /** Snapshots taken at issue time, so renaming a student or subject never rewrites a certificate. */
  studentName: string;
  platform: PlatformSlug;
  subjectSlug: string;
  subjectCode: string;
  subjectName: string;
  title: string;
  issuedAt: string;
  status: "issued" | "revoked";
  revokedAt?: string;
  /** "auto" = earned by completing every topic of the subject; "admin" = issued manually (demo). */
  source: "auto" | "admin";
}

/** What the PUBLIC verification page may show: no e-mail, no ids, abbreviated holder name. */
export interface CertificateVerification {
  number: string;
  holder: string;
  platform: PlatformSlug;
  subjectCode: string;
  subjectName: string;
  issuedAt: string;
  status: "issued" | "revoked";
}

export type NotificationTarget =
  | { kind: "topic"; id: string }
  | { kind: "test"; id: string }
  | { kind: "result"; id: string; attemptId?: string }
  | { kind: "exam"; id: string }
  | { kind: "certificate"; id?: string }
  | { kind: "material"; subjectSlug: string; topicId: string; id: string }
  | { kind: "subject"; slug: string }
  /** Admin-only destinations; `path` must start with /admin/ (checked when the link is resolved). */
  | { kind: "admin"; path: string }
  | { kind: "payment" }
  | { kind: "none" };

export type NotificationCode =
  | "welcome"
  | "topic_unlocked"
  | "result_ready"
  | "exam_scheduled"
  | "certificate_issued"
  | "certificate_revoked"
  | "payment_received"
  | "payment_failed"
  | "access_granted"
  | "access_revoked"
  | "enrolled"
  // student: content updates
  | "material_added"
  | "test_published"
  | "course_updated"
  // admin
  | "user_registered"
  | "test_submitted"
  | "certificate_auto_issued"
  | "system_event";

/** Notifications store a CODE + params, never prose — text is translated at render time (RU/EN/UZ). */
export interface AppNotification {
  id: string;
  code: NotificationCode;
  params?: Record<string, string>;
  createdAt: string;
  read: boolean;
  target: NotificationTarget;
}

export interface Payment {
  id: string;
  description: string;
  amountCents: number;
  currency: "USD";
  status: "paid" | "pending" | "refunded" | "failed" | "cancelled";
  createdAt: string;
  studentName?: string;
}

export interface Exam {
  id: string;
  title: string;
  platform: PlatformSlug;
  subjectSlug: string;
  startsAt: string;
  durationMinutes: number;
  status: "scheduled" | "open" | "completed";
  /** Best real result of the current learner (only when a user is known and has submitted an attempt). */
  score?: number;
  /** The current learner can open the exam player now (window open, access active). Demo fixtures are never startable. */
  startable?: boolean;
}

export interface StudentRecord extends User {
  platforms: PlatformSlug[];
  progress: number;
  archived?: boolean;
}

export interface StoredFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}
