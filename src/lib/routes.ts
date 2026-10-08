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

  dashboard: "/dashboard",
  courses: "/courses",
  coursePlatform: (slug: PlatformSlug) => `/platform/${slug}`,
  subject: (slug: string) => `/subject/${encodeURIComponent(slug)}`,
  subjectTab: (slug: string, tab: "overview" | "topics" | "tests" | "materials" | "progress") =>
    `/subject/${encodeURIComponent(slug)}?tab=${tab}`,
  topic: (id: string) => `/topic/${encodeURIComponent(id)}`,
  test: (id: string) => `/test/${encodeURIComponent(id)}`,
  testResult: (id: string, attemptId?: string) =>
    `/test/${encodeURIComponent(id)}/result${attemptId ? `?attempt=${encodeURIComponent(attemptId)}` : ""}`,
  exams: "/exams",
  progress: "/progress",
  ranking: "/ranking",
  certificates: "/certificates",
  payments: "/payments",
  notifications: "/notifications",
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
      return routes.certificates;
    case "payment":
      return routes.payments;
    case "none":
      return null;
  }
}
