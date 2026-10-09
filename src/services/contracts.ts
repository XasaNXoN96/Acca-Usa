import type { ProcessOutcome, ProviderEvent } from "./payments/contracts";
import type {
  RankingResult,
  ActivityItem,
  AdminStats,
  MaterialStats,
  IssuedCertificate,
  StatsFilter,
  AnswerMap,
  AppNotification,
  AttemptDraft,
  BankQuestion,
  Certificate,
  CertificateVerification,
  DashboardOverview,
  Difficulty,
  Enrollment,
  Exam,
  Locale,
  Material,
  MaterialKind,
  Payment,
  Platform,
  PlatformSlug,
  RankingEntry,
  ResultListItem,
  Role,
  StudentRecord,
  Subject,
  TestForAttempt,
  TestResult,
  TestSummary,
  TopicWithStatus,
  User,
  UserStatus,
} from "@/types";

/**
 * Service contracts. UI/route code depends ONLY on these interfaces.
 * Demo implementations live in services/mock (in-memory); Prisma-backed ones replace them
 * next stage without touching a component. Services never trust their callers' input:
 * server actions validate with Zod and check permissions before calling in.
 */

export interface Session {
  user: User;
  isDemo: boolean;
}

export type ServiceResult<T = void> = { ok: true; data: T } | { ok: false; code: string; field?: string };

/* ---------------- auth & users ---------------- */

export interface AuthService {
  register(input: { name: string; email: string; password: string; locale: Locale }): Promise<ServiceResult<User>>;
  /** Returns the user only when email + password match and the account is active. */
  verifyCredentials(email: string, password: string): Promise<{ user: User; tokenVersion: number } | { error: "INVALID" | "SUSPENDED" }>;
  /** Creates a single-use reset token. The raw token is returned ONLY to the caller (demo mode shows it; production emails it). */
  requestPasswordReset(email: string): Promise<{ token: string; user: { name: string; email: string; locale: Locale } } | null>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
  /** Used by the session layer: re-reads the user on every request (role/status changes apply immediately). */
  getSessionUser(userId: string, tokenVersion: number): Promise<User | null>;
}

export interface UserInput {
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  /** Only on create, or when an admin sets a temporary password. Hashed immediately; never stored in plaintext. */
  password?: string;
}

export interface UserService {
  getById(id: string): Promise<User | null>;
  listStudents(): Promise<StudentRecord[]>;
  create(input: UserInput & { password: string }): Promise<ServiceResult<User>>;
  update(id: string, input: UserInput): Promise<ServiceResult<User>>;
  setArchived(id: string, archived: boolean): Promise<ServiceResult>;
  updateLocale(userId: string, locale: Locale): Promise<void>;
  /** The learner edits THEIR OWN name and language (e-mail changes need verification and are not self-service). */
  updateProfile(userId: string, input: { name: string; locale: Locale }): Promise<ServiceResult>;
}

/* ---------------- catalogue ---------------- */

export interface PlatformService {
  list(): Promise<Platform[]>;
  listAll(): Promise<Platform[]>;
  getBySlug(slug: string): Promise<Platform | null>;
  update(slug: string, input: { name: string; fullName: string; priceCents: number }): Promise<ServiceResult>;
  setArchived(slug: string, archived: boolean): Promise<ServiceResult>;
}

export interface SubjectInput {
  code: string;
  name: string;
  levelId: string;
}
export interface SubjectService {
  list(): Promise<Subject[]>;
  listAll(): Promise<Subject[]>;
  listByPlatform(slug: PlatformSlug): Promise<Subject[]>;
  getBySlug(slug: string): Promise<Subject | null>;
  create(input: SubjectInput): Promise<ServiceResult<Subject>>;
  update(slug: string, input: SubjectInput): Promise<ServiceResult>;
  setArchived(slug: string, archived: boolean): Promise<ServiceResult>;
}

export interface TopicContext {
  topic: TopicWithStatus;
  subject: Subject;
  previous: TopicWithStatus | null;
  next: TopicWithStatus | null;
  materials: Material[];
}

export interface TopicInput {
  title: string;
  subjectSlug: string;
  description: string;
  durationMinutes: number;
  lessonCount: number;
}
export interface PublicTopic {
  id: string;
  /** 1-based position among the subject's visible topics (recomputed on every read) */
  order: number;
  title: string;
  /** Titles only (id, title, kind) — never file ids, bodies, URLs or sizes. */
  materials: { id: string; title: string; kind: MaterialKind }[];
}

export interface TopicService {
  /**
   * Public course outline: topic titles, positions and material TITLES only — no descriptions, files, bodies, tests or answers.
   * Safe to render for anonymous visitors. Reflects admin create / edit / archive immediately.
   */
  listPublic(subjectSlug: string): Promise<PublicTopic[]>;
  listForSubject(subjectSlug: string, userId: string): Promise<TopicWithStatus[]>;
  /** `includeHidden` (admin preview only): also lists draft / scheduled materials. */
  getContext(topicId: string, userId: string, includeHidden?: boolean): Promise<TopicContext | null>;
  listAll(): Promise<{ id: string; title: string; subjectSlug: string; order: number; durationMinutes: number; description: string; lessonCount: number; archived: boolean }[]>;
  create(input: TopicInput): Promise<ServiceResult<{ id: string }>>;
  update(id: string, input: TopicInput): Promise<ServiceResult>;
  setArchived(id: string, archived: boolean): Promise<ServiceResult>;
}

export interface MaterialInput {
  title: string;
  kind: MaterialKind;
  subjectSlug: string;
  topicId?: string;
  fileId?: string;
  body?: string;
  /** default true; false = draft */
  published?: boolean;
  /** ISO time; with published = scheduled */
  publishAt?: string | null;
  position?: number;
}
export interface MaterialService {
  listForSubject(subjectSlug: string): Promise<Material[]>;
  listAll(): Promise<Material[]>;
  getById(id: string): Promise<Material | null>;
  /** The non-archived material that uses this storage file (one indexed lookup — used by the file route on every request). */
  getByFileId(fileId: string): Promise<Material | null>;
  create(input: MaterialInput): Promise<ServiceResult<Material>>;
  /** `actorId` = the administrator making the change (recorded on the version that preserves the old content). */
  update(id: string, input: MaterialInput, actorId?: string): Promise<ServiceResult>;
  setArchived(id: string, archived: boolean): Promise<ServiceResult>;
}

/** A previous state of a material, kept when its file / text is replaced. */
export interface MaterialVersionInfo {
  id: string;
  materialId: string;
  kind: MaterialKind;
  title: string;
  fileId?: string;
  fileName?: string;
  fileMime?: string;
  fileSize?: number;
  fileStatus?: "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "REJECTED";
  /** first characters of a notes body */
  bodyPreview?: string;
  createdAt: string;
  createdById?: string;
}
export interface MaterialVersionService {
  /** Newest first. */
  list(materialId: string): Promise<MaterialVersionInfo[]>;
  /** Makes a past version current. The state it replaces is kept as a new version — nothing is lost. */
  restore(materialId: string, versionId: string, actorId?: string): Promise<ServiceResult>;
}

/* ---------------- transcripts & subtitles ---------------- */

export interface TranscriptSegment { start: number; end: number; text: string }
export type TranscriptStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export interface TranscriptRecord {
  materialId: string; language: Locale; status: TranscriptStatus;
  /** "manual" or the SpeechToTextProvider name */
  provider: string; segments: TranscriptSegment[]; errorCode?: string; updatedAt: string;
}
export interface SubtitleRecord { materialId: string; language: Locale; fileId: string; enabled: boolean; createdAt: string }

export interface MediaTextService {
  getTranscript(materialId: string): Promise<TranscriptRecord | null>;
  saveTranscript(input: { materialId: string; language: Locale; status: TranscriptStatus; provider: string; segments: TranscriptSegment[]; errorCode?: string }): Promise<void>;
  deleteTranscript(materialId: string): Promise<void>;
  listSubtitles(materialId: string): Promise<SubtitleRecord[]>;
  /** Adds / replaces the track of a language; returns the id of the file it replaced (the caller deletes it from storage). */
  putSubtitle(materialId: string, language: Locale, fileId: string): Promise<string | null>;
  setSubtitleEnabled(materialId: string, language: Locale, enabled: boolean): Promise<boolean>;
  /** Removes the track; returns its file id to delete from storage. */
  removeSubtitle(materialId: string, language: Locale): Promise<string | null>;
}

/* ---------------- enrolment & progress ---------------- */

export interface EnrollmentService {
  listForUser(userId: string): Promise<Enrollment[]>;
  /** True only while access is active: status FREE / ACTIVE and not past `expiresAt`. The server's single access check. */
  isEnrolled(userId: string, platform: PlatformSlug): Promise<boolean>;
  /** Self-service enrolment for FREE platforms. Paid platforms answer `PAYMENT_REQUIRED` — access then comes only from a verified payment. */
  enroll(userId: string, platform: PlatformSlug): Promise<ServiceResult>;
  leave(userId: string, platform: PlatformSlug): Promise<ServiceResult>;
  /** Admin: grants (or re-activates) access; `expiresAt` null = no expiry. */
  grant(input: { userId: string; platform: PlatformSlug; expiresAt?: string | null }): Promise<ServiceResult>;
  /** Admin: withdraws access (status REVOKED). The learner's progress is kept. */
  revoke(input: { userId: string; platform: PlatformSlug }): Promise<ServiceResult>;
  /** Admin: every enrolment record with its state (access management screen). */
  listAll(): Promise<EnrollmentRecordView[]>;
}

export interface EnrollmentRecordView {
  userId: string;
  userName: string;
  platform: PlatformSlug;
  status: "FREE" | "ACTIVE" | "EXPIRED" | "REVOKED";
  /** effective access right now (status AND expiry) */
  active: boolean;
  source: "self" | "payment" | "admin";
  expiresAt?: string;
  createdAt: string;
}

export interface ProgressService {
  getTopicProgress(userId: string): Promise<Record<string, number>>;
  /** Raises a topic from 0 to "started" the first time it is opened. Idempotent. */
  touchTopic(userId: string, topicId: string): Promise<void>;
  markTopicCompleted(userId: string, topicId: string): Promise<void>;
  /** Ids (out of the given ones) the user has marked as completed. Per Student + Material. */
  listCompletedMaterials(userId: string, materialIds: string[]): Promise<string[]>;
  setMaterialCompleted(userId: string, materialId: string, completed: boolean): Promise<void>;
  /** Remembers the last material the user opened (for "Continue learning"). */
  touchMaterial(userId: string, materialId: string): Promise<void>;
  getSubjectProgress(userId: string, subjectSlug: string): Promise<{ percent: number; completed: number; total: number }>;
  getPlatformProgress(userId: string): Promise<Record<PlatformSlug, number>>;
  recentActivity(userId: string, limit?: number): Promise<ActivityItem[]>;
}

/* ---------------- assessment ---------------- */

export interface QuestionInput {
  subjectSlug: string;
  topicId?: string;
  tags: string[];
  imageId?: string;
  status: "draft" | "published";
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  points: number;
  difficulty: Difficulty;
}
export interface QuestionService {
  list(): Promise<BankQuestion[]>;
  create(input: QuestionInput): Promise<ServiceResult<{ id: string }>>;
  update(id: string, input: QuestionInput): Promise<ServiceResult>;
  setArchived(id: string, archived: boolean): Promise<ServiceResult>;
  /**
   * Subject of a published question that uses this storage file as its image, if that question sits in a published
   * test. Lets /api/files serve question images to enrolled students without exposing unpublished content.
   */
  imageAccess(fileId: string): Promise<{ subjectSlug: string } | null>;
}

export interface TestInput {
  title: string;
  description: string;
  subjectSlug: string;
  topicId?: string;
  durationMinutes: number;
  passMark: number;
  /** 0 = unlimited */
  attemptsAllowed: number;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  /** Order = order of the test (unless randomised per attempt). */
  questionIds: string[];
  published: boolean;
}

export interface AttemptStart {
  attemptId: string;
  draft: AttemptDraft;
  deadlineAt: string;
}

export interface TestService {
  /** Student catalogue: published, non-archived tests only. */
  listForSubject(subjectSlug: string, userId: string): Promise<TestSummary[]>;
  listPublished(userId: string): Promise<TestSummary[]>;
  getSummary(testId: string, userId?: string): Promise<TestSummary | null>;
  /** Questions WITHOUT answers/explanations. Null if unpublished/archived. */
  getForAttempt(testId: string, userId?: string): Promise<TestForAttempt | null>;
  getActiveAttempt(userId: string, testId: string): Promise<AttemptStart | null>;
  startAttempt(userId: string, testId: string): Promise<ServiceResult<AttemptStart>>;
  saveDraft(userId: string, draft: AttemptDraft): Promise<ServiceResult<{ savedAt: string }>>;
  /** Server computes the score; the client never sees correct answers beforehand. */
  submit(input: { userId: string; testId: string; answers: AnswerMap; flagged: string[] }): Promise<ServiceResult<{ attemptId: string }>>;
  getResult(testId: string, userId: string, attemptId?: string): Promise<TestResult | null>;
  listResults(userId: string, limit?: number): Promise<ResultListItem[]>;
  /* admin */
  listAllForAdmin(): Promise<(TestSummary & { questionIds: string[] })[]>;
  create(input: TestInput): Promise<ServiceResult<{ id: string }>>;
  update(id: string, input: TestInput): Promise<ServiceResult>;
  setArchived(id: string, archived: boolean): Promise<ServiceResult>;
  /** Publish needs at least one published question; unpublish returns the test to draft. */
  setPublished(id: string, published: boolean): Promise<ServiceResult>;
  /** Draft copy ("<title> (copy)") with the same settings and question order. */
  duplicate(id: string): Promise<ServiceResult<{ id: string }>>;
}

/** Test results of one learner (history, review). */
export interface TestResultService {
  /** Latest result of the test, or one specific attempt. Includes the review (answers, explanations). */
  get(testId: string, userId: string, attemptId?: string): Promise<TestResult | null>;
  list(userId: string, limit?: number): Promise<ResultListItem[]>;
  /** All finished attempts of the learner for one test, newest first. */
  attemptsForTest(userId: string, testId: string): Promise<ResultListItem[]>;
}

export interface ExamService {
  /** Published exams; with a `userId` the learner's best REAL score and whether they can start now are filled in. */
  list(userId?: string): Promise<Exam[]>;
}

export interface PaymentService {
  listForUser(userId: string): Promise<Payment[]>;
  /** Admin ledger. */
  listAll(): Promise<Payment[]>;
  /** One payment, only if it belongs to `userId` (the id from the URL is never trusted to name the owner). */
  getForUser(userId: string, paymentId: string): Promise<Payment | null>;
  /**
   * Starts a purchase of full access to a paid platform. Idempotent per (userId, idempotencyKey): a double click returns the
   * same checkout. Access is NOT granted here — only by a verified provider event (`applyProviderEvent`).
   */
  startCheckout(input: { userId: string; platform: PlatformSlug; idempotencyKey: string; origin: string }): Promise<ServiceResult<{ paymentId: string; checkoutUrl: string }>>;
  /** Applies an AUTHENTICATED provider event (webhook route only). Idempotent per provider event id. */
  applyProviderEvent(provider: "demo" | "stripe", event: ProviderEvent): Promise<ProcessOutcome>;
  /** DEMO ONLY: completes a simulated checkout. Refuses (`DEMO_ONLY`) outside demo mode. */
  completeDemoCheckout(input: { userId: string; paymentId: string; outcome: "paid" | "failed" | "cancelled" }): Promise<ServiceResult>;
}

export interface RankingService {
  /** Top learners overall (dashboard preview); always includes the current user's row. */
  top(userId: string, limit: number): Promise<RankingEntry[]>;
  list(input: { userId: string; platform?: PlatformSlug; subjectSlug?: string; limit?: number }): Promise<RankingResult>;
}

export interface CertificateService {
  /** Earned + revoked certificates and the learner's progress towards the next ones. */
  listForUser(userId: string): Promise<Certificate[]>;
  /** One certificate record, only if it belongs to `userId` (admins pass `asAdmin`). */
  getForUser(userId: string, id: string, asAdmin?: boolean): Promise<IssuedCertificate | null>;
  /** Public lookup by certificate number: minimal data only (abbreviated holder, no e-mail / ids). Null if unknown. */
  verifyByNumber(number: string): Promise<CertificateVerification | null>;
  /* admin */
  listAll(): Promise<IssuedCertificate[]>;
  /** Manual (demo) issue for an enrolled student. Fails if an active certificate for the subject already exists. */
  issue(input: { userId: string; subjectSlug: string }): Promise<ServiceResult<{ id: string }>>;
  setRevoked(id: string, revoked: boolean): Promise<ServiceResult>;
}

export interface NotificationService {
  list(userId: string): Promise<AppNotification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}

export interface StatsService {
  /** Aggregates over the real service data (no invented numbers). Admin only — callers must authorise. */
  getAdminStats(filter: StatsFilter): Promise<AdminStats>;
}

/** Admin analytics of materials: real events only (views, completions, processing errors, topic test attempts). */
export interface MaterialStatsService {
  get(filter: StatsFilter): Promise<MaterialStats>;
}

export interface DashboardService {
  getOverview(userId: string): Promise<DashboardOverview>;
}

export interface SearchHit {
  kind: "subject" | "topic" | "material";
  id: string;
  title: string;
  context: string;
  href: string;
}
export interface SearchService {
  search(query: string): Promise<SearchHit[]>;
}

export interface Services {
  auth: AuthService;
  users: UserService;
  platforms: PlatformService;
  subjects: SubjectService;
  topics: TopicService;
  materials: MaterialService;
  mediaText: MediaTextService;
  materialVersions: MaterialVersionService;
  materialStats: MaterialStatsService;
  enrollments: EnrollmentService;
  questions: QuestionService;
  tests: TestService;
  testResults: TestResultService;
  exams: ExamService;
  payments: PaymentService;
  progress: ProgressService;
  ranking: RankingService;
  certificates: CertificateService;
  notifications: NotificationService;
  dashboard: DashboardService;
  stats: StatsService;
  search: SearchService;
}
