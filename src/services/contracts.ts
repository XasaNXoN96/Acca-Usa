import type {
  ActivityItem,
  AnswerMap,
  AppNotification,
  AttemptDraft,
  Certificate,
  DashboardOverview,
  Exam,
  Locale,
  Material,
  Payment,
  Platform,
  PlatformSlug,
  PublicQuestion,
  RankingEntry,
  Role,
  StudentRecord,
  Subject,
  TestForAttempt,
  TestResult,
  TestSummary,
  TopicStatus,
  TopicWithStatus,
  User,
} from "@/types";

/**
 * Service contracts. UI/route code depends ONLY on these interfaces.
 * Mock implementations live in services/mock; Prisma-backed ones will replace
 * them next stage without touching a single component.
 */

export interface Session {
  user: User;
  /** True while authentication is not wired up — the UI shows a visible notice. */
  isDemo: boolean;
}

export interface AuthService {
  getSession(role?: Role): Promise<Session>;
}

export interface UserService {
  getById(id: string): Promise<User | null>;
  listStudents(): Promise<StudentRecord[]>;
  updateLocale(userId: string, locale: Locale): Promise<void>;
}

export interface PlatformService {
  list(): Promise<Platform[]>;
  getBySlug(slug: string): Promise<Platform | null>;
}

export interface SubjectService {
  list(): Promise<Subject[]>;
  listByPlatform(slug: PlatformSlug): Promise<Subject[]>;
  getBySlug(slug: string): Promise<Subject | null>;
}

export interface TopicContext {
  topic: TopicWithStatus;
  subject: Subject;
  previous: TopicWithStatus | null;
  next: TopicWithStatus | null;
  materials: Material[];
}

export interface TopicService {
  listForSubject(subjectSlug: string, userId: string): Promise<TopicWithStatus[]>;
  getContext(topicId: string, userId: string): Promise<TopicContext | null>;
  listAll(): Promise<{ id: string; title: string; subjectSlug: string; order: number }[]>;
}

export interface MaterialService {
  listForSubject(subjectSlug: string): Promise<Material[]>;
  listAll(): Promise<Material[]>;
}

export interface SubmitAttemptInput {
  userId: string;
  testId: string;
  answers: AnswerMap;
  flagged: string[];
  elapsedSeconds: number;
}

export interface TestService {
  listAll(): Promise<TestSummary[]>;
  listForSubject(subjectSlug: string, userId: string): Promise<TestSummary[]>;
  getForAttempt(testId: string): Promise<TestForAttempt | null>;
  getSummary(testId: string): Promise<TestSummary | null>;
  /** Server computes the score; the client never sees correct answers beforehand. */
  submit(input: SubmitAttemptInput): Promise<{ attemptId: string }>;
  getResult(testId: string, userId: string, attemptId?: string): Promise<TestResult | null>;
  /** Autosave architecture: drafts persist server-side (never localStorage). */
  saveDraft(userId: string, draft: AttemptDraft): Promise<{ savedAt: string }>;
  loadDraft(userId: string, testId: string): Promise<AttemptDraft | null>;
  listQuestions(): Promise<{ id: string; text: string; options: number }[]>;
}

export interface ExamService {
  list(): Promise<Exam[]>;
}

export interface PaymentService {
  listForUser(userId: string): Promise<Payment[]>;
  listAll(): Promise<Payment[]>;
}

export interface ProgressService {
  getTopicProgress(userId: string): Promise<Record<string, number>>;
  markTopicCompleted(userId: string, topicId: string): Promise<void>;
  getSubjectProgress(userId: string, subjectSlug: string): Promise<{ percent: number; completed: number; total: number }>;
  getPlatformProgress(userId: string): Promise<Record<PlatformSlug, number>>;
  recentActivity(userId: string): Promise<ActivityItem[]>;
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

export type { PublicQuestion, TopicStatus };
