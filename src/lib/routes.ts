import type { AppNotification, PlatformSlug } from "@/types";

/**
 * Single source of truth for URLs. Never hand-write hrefs in components —
 * a renamed route then breaks the build instead of silently 404-ing.
 */
export const routes = {
  home: "/",
  platform: (slug: PlatformSlug) => `/${slug}` as const,
  books: "/books",
  forums: "/forums",
  search: (q?: string) => (q ? `/search?q=${encodeURIComponent(q)}` : "/search"),
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",

  dashboard: "/dashboard",
  courses: "/courses",
  /** Public catalogue of every subject (no materials, no login). */
  allCourses: "/all-courses",
  coursePlatform: (slug: PlatformSlug) => `/platform/${slug}`,
  subject: (slug: string) => `/subject/${encodeURIComponent(slug)}`,
  subjectTab: (slug: string, tab: "overview" | "topics" | "tests" | "materials" | "progress") =>
    `/subject/${encodeURIComponent(slug)}?tab=${tab}`,
  /** Canonical topic URL (protected). The subject page itself is public and lists only topic titles. */
  subjectTopic: (subjectSlug: string, topicId: string) => `/subject/${encodeURIComponent(subjectSlug)}/topic/${encodeURIComponent(topicId)}`,
  /** Student material viewer (protected: session + enrolment + unlocked topic, enforced on the server). */
  subjectMaterial: (subjectSlug: string, topicId: string, materialId: string) =>
    `/subject/${encodeURIComponent(subjectSlug)}/topic/${encodeURIComponent(topicId)}/material/${encodeURIComponent(materialId)}`,
  /** Legacy topic URL (notifications, activity, search): redirects to the canonical subject/topic URL. */
  topic: (id: string) => `/topic/${encodeURIComponent(id)}`,
  test: (id: string) => `/test/${encodeURIComponent(id)}`,
  testResult: (id: string, attemptId?: string) =>
    `/test/${encodeURIComponent(id)}/result${attemptId ? `?attempt=${encodeURIComponent(attemptId)}` : ""}`,
  exams: "/exams",
  certificate: (id: string) => `/certificates/${encodeURIComponent(id)}`,
  progress: "/progress",
  ranking: "/ranking",
  notes: "/notes",
  mistakes: "/mistakes",
  mistakesPractice: "/mistakes/practice",
  certificates: "/certificates",
  payments: "/payments",
  notifications: "/notifications",
  adminNotifications: "/admin/notifications",
  profile: "/profile",

  admin: "/admin",
  adminSection: (
    section:
      | "platforms"
      | "subjects"
      | "topics"
      | "materials"
      | "question-bank"
      | "tests"
      | "exams"
      | "students"
      | "access"
      | "certificates"
      | "payments"
      | "statistics"
      | "settings",
  ) => `/admin/${section}` as const,
} as const;

/** Resolves where a notification should send the user. Keeps routing logic out of UI components. */
export function notificationHref(n: Pick<AppNotification, "target">): string | null {
  const t = n.target;
  switch (t.kind) {
    case "topic":
      return routes.topic(t.id);
    case "test":
      return routes.test(t.id);
    case "result":
      return routes.testResult(t.id, t.attemptId);
    case "exam":
      return routes.exams;
    case "certificate":
      return t.id ? routes.certificate(t.id) : routes.certificates;
    case "material":
      return routes.subjectMaterial(t.subjectSlug, t.topicId, t.id);
    case "subject":
      return routes.subject(t.slug);
    case "admin":
      return t.path.startsWith("/admin/") ? t.path : null; // never follow anything outside the admin area
    case "payment":
      return routes.payments;
    case "none":
      return null;
  }
}
