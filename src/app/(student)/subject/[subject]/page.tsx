import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubjectHeader } from "@/features/subject/subject-header";
import { SubjectNav, subjectTabs, type SubjectTab } from "@/features/subject/subject-nav";
import { TopicList } from "@/features/subject/topic-list";
import { TestList } from "@/features/subject/test-list";
import { MaterialList } from "@/features/subject/material-list";
import { ProgressPanel } from "@/features/subject/progress-panel";
import { services } from "@/services";
import { routes } from "@/lib/routes";

type Params = Promise<{ subject: string }>;
type Search = Promise<{ tab?: string | string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const subject = await services.subjects.getBySlug((await params).subject);
  return { title: subject ? `${subject.code} — ${subject.name}` : "Subject" };
}

function parseTab(raw: string | string[] | undefined): SubjectTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (subjectTabs as readonly string[]).includes(v ?? "") ? (v as SubjectTab) : "topics";
}

export default async function SubjectPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ subject: slug }, sp] = await Promise.all([params, searchParams]);
  const subject = await services.subjects.getBySlug(slug);
  if (!subject) notFound();

  const tab = parseTab(sp.tab);
  const session = await services.auth.getSession("STUDENT");
  const userId = session.user.id;
  const [t, topics, tests, materials, progress] = await Promise.all([
    getTranslations("subject"),
    services.topics.listForSubject(subject.slug, userId),
    services.tests.listForSubject(subject.slug, userId),
    services.materials.listForSubject(subject.slug),
    services.progress.getSubjectProgress(userId, subject.slug),
  ]);
  const next = topics.find((x) => x.status === "in_progress" || x.status === "unlocked");

  return (
    <div className="space-y-6">
      <SubjectHeader subject={subject} percent={progress.percent} completed={progress.completed} total={progress.total} />

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside>
          <SubjectNav slug={subject.slug} active={tab} />
        </aside>

        <section aria-label={t(`tabs.${tab}`)} className="min-w-0 space-y-4">
          {tab === "overview" ? (
            <div className="space-y-4">
              <Card className="space-y-2 p-5">
                <h2 className="type-h3">{t("overviewTitle")}</h2>
                <p className="text-muted-foreground">{t("overviewText")}</p>
              </Card>
              {next ? (
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="type-eyebrow text-muted-foreground">{t("next")}</p>
                    <p className="type-h3 truncate">{next.order}. {next.title}</p>
                  </div>
                  <Button asChild>
                    <Link href={routes.topic(next.id)}>{next.status === "in_progress" ? t("continueTopic") : t("startTopic")}</Link>
                  </Button>
                </Card>
              ) : null}
            </div>
          ) : null}
          {tab === "topics" ? <TopicList topics={topics} /> : null}
          {tab === "tests" ? <TestList tests={tests} /> : null}
          {tab === "materials" ? <MaterialList materials={materials} /> : null}
          {tab === "progress" ? <ProgressPanel topics={topics} platform={subject.platform} /> : null}
        </section>
      </div>
    </div>
  );
}
