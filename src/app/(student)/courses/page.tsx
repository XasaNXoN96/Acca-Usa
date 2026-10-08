import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PlatformCourses } from "@/features/courses/platform-courses";
import { services } from "@/services";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("courses"))("title") };
}

export default async function CoursesPage() {
  const session = await services.auth.getSession("STUDENT");
  const t = await getTranslations("courses");
  const c = await getTranslations("dashboard");
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<DemoBadge />}
      />
      <div className="space-y-12">
        <PlatformCourses slug="acca" userId={session.user.id} />
        <PlatformCourses slug="cima" userId={session.user.id} />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card p-4">
          <p className="type-small text-muted-foreground">FIA — {c("notEnrolled")}</p>
          <Button asChild variant="outline" size="sm"><Link href={routes.coursePlatform("fia")}>{c("explore")}</Link></Button>
        </div>
      </div>
    </>
  );
}
