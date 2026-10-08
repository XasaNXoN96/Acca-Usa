import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformCourses } from "@/features/courses/platform-courses";
import { PlatformGate } from "@/features/courses/platform-gate";
import { LeaveButton } from "@/features/courses/enroll-buttons";
import { isPlatformSlug } from "@/lib/platform-theme";
import { requireSession } from "@/lib/auth/guards";
import { services } from "@/services";

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }): Promise<Metadata> {
  const { platform } = await params;
  return { title: platform.toUpperCase() };
}

export default async function PlatformCoursesPage({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isPlatformSlug(platform)) notFound();
  const session = await requireSession();
  if (!(await services.platforms.getBySlug(platform))) notFound();
  if (!(await services.enrollments.isEnrolled(session.user.id, platform))) return <PlatformGate slug={platform} />;
  return (
    <div className="space-y-6">
      <div className="flex justify-end"><LeaveButton platform={platform} /></div>
      <PlatformCourses slug={platform} userId={session.user.id} headingLevel="h1" />
    </div>
  );
}
