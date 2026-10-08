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
export interface BankQuestion {
  id: string;
  subjectSlug: string;
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
  questionCount: number;
  totalPoints: number;
  durationMinutes: number;
  passMark: number;
  published: boolean;
  /** Best score for the current user in %, if attempted. */
  bestScore?: number;
  archived?: boolean;
}

/** What the browser receives. Correct answers and explanations never leave the server before submission. */
export interface PublicQuestion {
  id: string;
  text: string;
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
  status: "active" | "not_enrolled";
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

export interface DashboardOverview {
  user: User;
  stats: { enrolledCourses: number; completedTopics: number; learningHours: number; overallProgress: number };
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

export interface RankingEntry {
  rank: number;
  userId: string;
  name: string;
  points: number;
  isCurrentUser: boolean;
}

export interface Certificate {
  id: string;
  title: string;
  platform: PlatformSlug;
  status: "earned" | "in_progress";
  issuedAt?: string;
  progress: number;
}

export type NotificationTarget =
  | { kind: "topic"; id: string }
  | { kind: "test"; id: string }
  | { kind: "result"; id: string; attemptId?: string }
  | { kind: "exam"; id: string }
  | { kind: "certificate" }
  | { kind: "payment" }
  | { kind: "none" };

export type NotificationCode =
  | "welcome"
  | "topic_unlocked"
  | "result_ready"
  | "exam_scheduled"
  | "certificate_issued"
  | "payment_received"
  | "enrolled";

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
  status: "paid" | "pending" | "refunded" | "failed";
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
  score?: number;
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
