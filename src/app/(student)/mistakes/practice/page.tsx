import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { PracticeRunner } from "@/features/mistakes/practice-runner";
import { requireSession } from "@/lib/auth/guards";
import { routes } from "@/lib/routes";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("mistakes.practice"))("title") };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function PracticePage({ searchParams }: { searchParams: Search }) {
  const [session, sp, t] = await Promise.all([requireSession(), searchParams, getTranslations("mistakes.practice")]);
  const raw = Array.isArray(sp.subject) ? sp.subject[0] : sp.subject;
  const questions = await services.mistakes.practiceSet(session.user.id, { subjectSlug: raw || undefined, limit: 10 });
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      {questions.length === 0
        ? <EmptyState title={t("nothingTitle")} description={t("nothingText")} action={<Button asChild variant="outline"><Link href={routes.mistakes}>{t("backToMistakes")}</Link></Button>} />
        : <PracticeRunner questions={questions} backHref={routes.mistakes} />}
    </div>
  );
}
