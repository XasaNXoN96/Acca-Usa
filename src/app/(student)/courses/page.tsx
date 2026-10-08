import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformMark } from "@/components/layout/platform-mark";
import { PlatformCourses } from "@/features/courses/platform-courses";
import { EnrollButton, LeaveButton } from "@/features/courses/enroll-buttons";
import { requireSession } from "@/lib/auth/guards";
import { services } from "@/services";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("courses"))("title") };
}

export default async function CoursesPage() {
  const session = await requireSession();
  const [t, d, enrollments, platforms] = await Promise.all([
    getTranslations("courses"),
    getTranslations("dashboard"),
    services.enrollments.listForUser(session.user.id),
    services.platforms.list(),
  ]);
  const enrolled = enrollments.filter((e) => e.status === "active");
  const available = enrollments.filter((e) => e.status !== "active");
  const full = (slug: string) => platforms.find((p) => p.slug === slug)?.fullName ?? "";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {enrolled.length === 0 ? (
        <Card className="space-y-1 p-5">
          <h2 className="type-h3">{d("noEnrollmentsTitle")}</h2>
          <p className="type-small text-muted-foreground">{d("noEnrollmentsText")}</p>
        </Card>
      ) : null}

      <div className="space-y-12">
        {enrolled.map((e) => (
          <div key={e.platform} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">{t("enrolled")}</Badge>
              <span className="flex-1" />
              <LeaveButton platform={e.platform} />
            </div>
            <PlatformCourses slug={e.platform} userId={session.user.id} />
          </div>
        ))}
      </div>

      {available.length ? (
        <section aria-labelledby="enroll-more" className="space-y-3">
          <h2 id="enroll-more" className="type-h3">{d("enrollTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {available.map((e) => (
              <Card key={e.platform} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <PlatformMark platform={e.platform} />
                  <div className="min-w-0">
                    <h3 className="type-h3 uppercase">{e.platform}</h3>
                    <p className="type-caption line-clamp-2 text-muted-foreground">{full(e.platform)}</p>
                  </div>
                </div>
                <EnrollButton platform={e.platform} priceCents={e.priceCents} access={e.access} className="mt-auto" />
                <Button asChild variant="ghost" size="sm"><Link href={routes.coursePlatform(e.platform)}>{t("viewSubjects")}</Link></Button>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
