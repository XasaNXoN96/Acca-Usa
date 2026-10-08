import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { TopicWorkspace } from "@/features/topic/topic-workspace";
import { TopicFooter } from "@/features/topic/topic-footer";
import { services } from "@/services";
import { routes } from "@/lib/routes";

type Params = Promise<{ topic: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { topic } = await params;
  const session = await services.auth.getSession("STUDENT");
  const ctx = await services.topics.getContext(topic, session.user.id);
  return { title: ctx?.topic.title ?? "Topic" };
}

export default async function TopicPage({ params }: { params: Params }) {
  const { topic: topicId } = await params;
  const session = await services.auth.getSession("STUDENT");
  const ctx = await services.topics.getContext(topicId, session.user.id);
  if (!ctx) notFound();

  const [t, n, tests] = await Promise.all([
    getTranslations("topic"),
    getTranslations("nav"),
    services.tests.listForSubject(ctx.subject.slug, session.user.id),
  ]);
  const { topic, subject, previous, next } = ctx;
  const crumbs = [
    { label: n("courses"), href: routes.courses },
    { label: subject.platform.toUpperCase(), href: routes.coursePlatform(subject.platform) },
    { label: subject.code, href: routes.subject(subject.slug) },
    { label: topic.title },
  ];

  // Enforced on the server — hiding the UI is not access control.
  if (topic.status === "locked") {
    return (
      <div className="space-y-6">
        <Breadcrumbs label="Breadcrumb" items={crumbs} />
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

  const testId = tests.find((x) => x.topicId === topic.id)?.id ?? null;
  const completed = topic.status === "completed";
  const nextHref = next && (completed || next.status !== "locked") ? routes.topic(next.id) : null;

  return (
    <div className="space-y-6">
      <Breadcrumbs label="Breadcrumb" items={crumbs} />
      <h1 className="type-h1 text-balance">{topic.title}</h1>
      <TopicWorkspace
        title={topic.title}
        description={topic.description}
        keyPoints={topic.keyPoints}
        materials={ctx.materials}
        testId={testId}
      />
      <TopicFooter
        topicId={topic.id}
        completed={completed}
        previousHref={previous ? routes.topic(previous.id) : null}
        nextHref={nextHref}
      />
    </div>
  );
}
