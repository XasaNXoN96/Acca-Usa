import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformCourses } from "@/features/courses/platform-courses";
import { isPlatformSlug } from "@/lib/platform-theme";
import { services } from "@/services";

export async function generateMetadata({ params }: { params: Promise<{ platform: string }> }): Promise<Metadata> {
  const { platform } = await params;
  return { title: platform.toUpperCase() };
}

export default async function PlatformCoursesPage({ params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isPlatformSlug(platform)) notFound();
  const session = await services.auth.getSession("STUDENT");
  return <PlatformCourses slug={platform} userId={session.user.id} headingLevel="h1" />;
}
