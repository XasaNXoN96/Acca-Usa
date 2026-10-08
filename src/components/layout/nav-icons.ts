import {
  Award, BarChart3, Bell, BookOpen, ClipboardCheck, ClipboardList, CreditCard, FileText, GraduationCap,
  Landmark, Layers, LayoutDashboard, Library, ListChecks, Medal, Settings, Target, TrendingUp, User, Users,
  Video, CircleHelp,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/lib/navigation";

export const navIcons: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  acca: Landmark,
  fia: GraduationCap,
  exams: ClipboardCheck,
  progress: TrendingUp,
  ranking: Medal,
  certificates: Award,
  payments: CreditCard,
  notifications: Bell,
  profile: User,
  overview: LayoutDashboard,
  platforms: Layers,
  subjects: Library,
  topics: ListChecks,
  materials: Video,
  questions: CircleHelp,
  tests: ClipboardList,
  students: Users,
  statistics: BarChart3,
  settings: Settings,
};

export { FileText, Target };
