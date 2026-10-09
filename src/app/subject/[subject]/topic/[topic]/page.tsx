import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { TopicWorkspace } from "@/features/topic/topic-workspace";
import { watermarkText } from "@/features/material/watermark";
import { TopicFooter } from "@/features/topic/topic-footer";
import { TopicTouch } from "@/features/topic/topic-touch";
import { TopicTestCard } from "@/features/topic/topic-test-card";
import { TopicMaterialList } from "@/features/topic/topic-material-list";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { requireSession } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { StudentShell } from "@/components/layout/student-shell";

type Params = Promise<{ subject: string; topic: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { topic } = await params;
  const session = await getSession();
  const ctx = session ? await services.topics.getContext(topic, session.user.id) : null;
  return { title: ctx?.topic.title ?? "—" };
}

/** Protected (proxy + server guard): anonymous visitors are sent to /login?next=<this url>. */
export default async function TopicPage({ params }: { params: Params }) {
  const { subject: subjectSlug, topic: topicId } = await params;
  return (
    <StudentShell>
      <TopicContent subjectSlug={subjectSlug} topicId={topicId} />
    </StudentShell>
  );
}

async function TopicContent({ subjectSlug, topicId }: { subjectSlug: string; topicId: string }) {
  const session = await requireSession();
  const ctx = await services.topics.getContext(topicId, session.user.id);
  if (!ctx) notFound();

  const [t, n, c, tests, completedMaterials] = await Promise.all([
    getTranslations("topic"),
    getTranslations("nav"),
    getTranslations("common"),
    services.tests.listForSubject(ctx.subject.slug, session.user.id),
    services.progress.listCompletedMaterials(session.user.id, ctx.materials.map((m) => m.id)),
  ]);
  const { topic, subject, previous, next } = ctx;
  if (subject.slug !== subjectSlug) redirect(routes.subjectTopic(subject.slug, topic.id)); // wrong subject in the URL → canonical
  const isAdmin = session.user.role === "ADMIN"; // admins may open any topic to review content
  if (!isAdmin && !(await services.enrollments.isEnrolled(session.user.id, subject.platform))) redirect(routes.coursePlatform(subject.platform));
  const crumbs = [
    { label: n("courses"), href: routes.courses },
    { label: subject.platform.toUpperCase(), href: routes.coursePlatform(subject.platform) },
    { label: subject.code, href: routes.subject(subject.slug) },
    { label: topic.title },
  ];

  // Enforced on the server — hiding the UI is not access control.
  if (!isAdmin && topic.status === "locked") {
    return (
      <div className="space-y-6">
        <Breadcrumbs label={c("breadcrumb")} items={crumbs} />
        <EmptyState
          icon={<Lock aria-hidden />}
          title={t("lockedTitle")}
          description={t("lockedText")}
          action={
            <Button asChild>
              <Link href={routes.subject(subject.slug)}>{t("backToSubject")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const topicTest = tests.find((x) => x.topicId === topic.id) ?? null;
  const testId = topicTest?.id ?? null;
  const completed = topic.status === "completed";
  const nextHref = next && (completed || next.status !== "locked") ? routes.subjectTopic(subject.slug, next.id) : null;

  return (
    <div className="space-y-6">
      <Breadcrumbs label={c("breadcrumb")} items={crumbs} />
      <h1 className="type-h1 text-balance">{topic.title}</h1>
      <TopicTouch topicId={topic.id} active={topic.status !== "completed"} />
      {topicTest ? <TopicTestCard test={topicTest} /> : null}
      <TopicMaterialList subjectSlug={subject.slug} topicId={topic.id} materials={ctx.materials} completedIds={completedMaterials} />
      <TopicWorkspace
        description={topic.description}
        keyPoints={topic.keyPoints}
        materials={ctx.materials}
        testId={testId}
        canDownload={isAdmin}
        watermark={watermarkText(session.user)}
      />
      <TopicFooter
        topicId={topic.id}
        completed={completed}
        previousHref={previous ? routes.subjectTopic(subject.slug, previous.id) : null}
        nextHref={nextHref}
      />
    </div>
  );
}
