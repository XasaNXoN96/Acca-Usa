import type { Difficulty, Locale, Material, PlatformSlug, Role, TestResult, Topic, UserStatus } from "@/types";

/** Record shapes shared by every data provider (in-memory demo, Prisma). Pure types — no server-only imports. */
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
export interface PlatformRec { slug: PlatformSlug; name: string; fullName: string; /** USD cents; 0 = free enrolment */ priceCents: number; deletedAt?: string }
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
export type EnrollmentStatusValue = "FREE" | "ACTIVE" | "EXPIRED" | "REVOKED";
export interface EnrollmentRec {
  userId: string;
  platform: PlatformSlug;
  status: EnrollmentStatusValue;
  source: "self" | "payment" | "admin";
  paymentId?: string;
  /** undefined = does not expire */
  expiresAt?: string;
  createdAt: string;
}
export interface ProgressEntry { percent: number; updatedAt: string }


/** What the pure learning-progress logic (domain/calc.ts) needs to read. The demo `Db` satisfies it, and so does a
 *  scoped snapshot loaded from PostgreSQL — one implementation of the progress rules for both providers. */
export interface CalcAttempt { userId: string; testId: string; result?: { scorePercent: number; passed: boolean } }
export interface CalcDb {
  platforms: PlatformRec[];
  levels: LevelRec[];
  subjects: SubjectRec[];
  topics: TopicRec[];
  materials: Pick<MaterialRec, "id" | "topicId" | "deletedAt">[];
  questions: Pick<QuestionRec, "id" | "deletedAt" | "status">[];
  tests: Pick<TestRec, "id" | "topicId" | "published" | "deletedAt" | "questionIds">[];
  enrollments: Pick<EnrollmentRec, "userId" | "platform" | "status" | "expiresAt">[];
  progress: Map<string, Map<string, ProgressEntry>>;
  materialProgress: { userId: string; materialId: string }[];
  attempts: CalcAttempt[];
}
