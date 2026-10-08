import type {
  ActivityItem,
  AnswerMap,
  AppNotification,
  AttemptDraft,
  BankQuestion,
  Certificate,
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
  requestPasswordReset(email: string): Promise<{ token: string } | null>;
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
}

/* ---------------- catalogue ---------------- */

export interface PlatformService {
  list(): Promise<Platform[]>;
  listAll(): Promise<Platform[]>;
  getBySlug(slug: string): Promise<Platform | null>;
  update(slug: string, input: { name: string; fullName: string }): Promise<ServiceResult>;
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
}

export interface TopicService {
  /**
   * Public course outline: titles and positions ONLY — no descriptions, materials, tests or answers.
   * Safe to render for anonymous visitors. Reflects admin create / edit / archive immediately.
   */
  listPublic(subjectSlug: string): Promise<PublicTopic[]>;
  listForSubject(subjectSlug: string, userId: string): Promise<TopicWithStatus[]>;
  getContext(topicId: string, userId: string): Promise<TopicContext | null>;
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
}
export interface MaterialService {
  listForSubject(subjectSlug: string): Promise<Material[]>;
  listAll(): Promise<Material[]>;
  getById(id: string): Promise<Material | null>;
  create(input: MaterialInput): Promise<ServiceResult<Material>>;
  update(id: string, input: MaterialInput): Promise<ServiceResult>;
  setArchived(id: string, archived: boolean): Promise<ServiceResult>;
}

/* ---------------- enrolment & progress ---------------- */

export interface EnrollmentService {
  listForUser(userId: string): Promise<Enrollment[]>;
  isEnrolled(userId: string, platform: PlatformSlug): Promise<boolean>;
  enroll(userId: string, platform: PlatformSlug): Promise<ServiceResult>;
  leave(userId: string, platform: PlatformSlug): Promise<ServiceResult>;
}

export interface ProgressService {
  getTopicProgress(userId: string): Promise<Record<string, number>>;
  /** Raises a topic from 0 to "started" the first time it is opened. Idempotent. */
  touchTopic(userId: string, topicId: string): Promise<void>;
  markTopicCompleted(userId: string, topicId: string): Promise<void>;
  getSubjectProgress(userId: string, subjectSlug: string): Promise<{ percent: number; completed: number; total: number }>;
  getPlatformProgress(userId: string): Promise<Record<PlatformSlug, number>>;
  recentActivity(userId: string, limit?: number): Promise<ActivityItem[]>;
}

/* ---------------- assessment ---------------- */

export interface QuestionInput {
  subjectSlug: string;
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
}

export interface TestInput {
  title: string;
  subjectSlug: string;
  topicId?: string;
  durationMinutes: number;
  passMark: number;
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
  getSummary(testId: string): Promise<TestSummary | null>;
  /** Questions WITHOUT answers/explanations. Null if unpublished/archived. */
  getForAttempt(testId: string): Promise<TestForAttempt | null>;
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
}

export interface ExamService {
  list(): Promise<Exam[]>;
}

export interface PaymentService {
  listForUser(userId: string): Promise<Payment[]>;
  listAll(): Promise<Payment[]>;
}

export interface RankingService {
  top(userId: string, limit: number): Promise<RankingEntry[]>;
}

export interface CertificateService {
  listForUser(userId: string): Promise<Certificate[]>;
}

export interface NotificationService {
  list(userId: string): Promise<AppNotification[]>;
  unreadCount(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
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
  enrollments: EnrollmentService;
  questions: QuestionService;
  tests: TestService;
  exams: ExamService;
  payments: PaymentService;
  progress: ProgressService;
  ranking: RankingService;
  certificates: CertificateService;
  notifications: NotificationService;
  dashboard: DashboardService;
  search: SearchService;
}
