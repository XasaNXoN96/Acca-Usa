import { routes } from "./routes";
import type { Permission } from "./permissions";

export type NavIconName =
  | "dashboard" | "courses" | "acca" | "fia" | "exams" | "progress" | "ranking"
  | "certificates" | "payments" | "notifications" | "profile" | "platforms" | "subjects"
  | "topics" | "materials" | "questions" | "tests" | "students" | "statistics" | "settings" | "overview";

export interface NavItem {
  /** key inside the `nav` (or admin) message namespace */
  labelKey: string;
  href: string;
  icon: NavIconName;
  /** path prefixes that mark this item active (defaults to href) */
  match?: string[];
  exact?: boolean;
  /** admin items: hidden unless the role holds this permission */
  permission?: Permission;
}

export const studentNav: NavItem[] = [
  { labelKey: "dashboard", href: routes.dashboard, icon: "dashboard", exact: true },
  { labelKey: "courses", href: routes.courses, icon: "courses", match: ["/courses", "/subject", "/topic"] },
  { labelKey: "acca", href: routes.coursePlatform("acca"), icon: "acca" },
  { labelKey: "fia", href: routes.coursePlatform("fia"), icon: "fia" },
  { labelKey: "exams", href: routes.exams, icon: "exams" },
  { labelKey: "progress", href: routes.progress, icon: "progress" },
  { labelKey: "ranking", href: routes.ranking, icon: "ranking" },
  { labelKey: "certificates", href: routes.certificates, icon: "certificates" },
  { labelKey: "payments", href: routes.payments, icon: "payments" },
  { labelKey: "notifications", href: routes.notifications, icon: "notifications" },
  { labelKey: "profile", href: routes.profile, icon: "profile" },
];

/** The 5 most used destinations, shown in the mobile bottom bar. */
export const studentBottomNav: NavItem[] = [
  studentNav[0]!,
  studentNav[1]!,
  { labelKey: "exams", href: routes.exams, icon: "exams" },
  { labelKey: "progress", href: routes.progress, icon: "progress" },
  { labelKey: "profile", href: routes.profile, icon: "profile" },
];

export const adminNav: NavItem[] = [
  { labelKey: "overview", href: routes.admin, icon: "overview", exact: true },
  { labelKey: "platforms", href: routes.adminSection("platforms"), icon: "platforms", permission: "manage_content" },
  { labelKey: "subjects", href: routes.adminSection("subjects"), icon: "subjects", permission: "manage_content" },
  { labelKey: "topics", href: routes.adminSection("topics"), icon: "topics", permission: "manage_content" },
  { labelKey: "materials", href: routes.adminSection("materials"), icon: "materials", permission: "manage_content" },
  { labelKey: "question-bank", href: routes.adminSection("question-bank"), icon: "questions", permission: "manage_tests" },
  { labelKey: "tests", href: routes.adminSection("tests"), icon: "tests", permission: "manage_tests" },
  { labelKey: "exams", href: routes.adminSection("exams"), icon: "exams", permission: "manage_tests" },
  { labelKey: "students", href: routes.adminSection("students"), icon: "students", permission: "view_students" },
  { labelKey: "payments", href: routes.adminSection("payments"), icon: "payments", permission: "manage_payments" },
  { labelKey: "statistics", href: routes.adminSection("statistics"), icon: "statistics", permission: "view_statistics" },
  { labelKey: "settings", href: routes.adminSection("settings"), icon: "settings", permission: "manage_settings" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
