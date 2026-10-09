import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { ScoreSummary } from "@/features/result/score-summary";
import { ProgressUpdate } from "@/features/result/progress-update";
import { ReviewList } from "@/features/result/review-list";
import { AttemptHistory } from "@/features/result/attempt-history";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { requireSession } from "@/lib/auth/guards";

type Params = Promise<{ test: string }>;
type Search = Promise<{ attempt?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("result"))("title") };
}

export default async function ResultPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ test: testId }, sp] = await Promise.all([params, searchParams]);
  const attemptId = Array.isArray(sp.attempt) ? sp.attempt[0] : sp.attempt;
  const session = await requireSession();
  const [t, result, summary, history] = await Promise.all([
    getTranslations("result"),
    services.testResults.get(testId, session.user.id, attemptId),
    services.tests.getSummary(testId, session.user.id),
    services.testResults.attemptsForTest(session.user.id, testId),
  ]);
  if (!result) {
    if (!summary) notFound();
    return (
      <main id="main" tabIndex={-1} className="container-page grid min-h-dvh place-items-center py-10 outline-none">
        <div className="w-full max-w-lg">
          <EmptyState
            title={t("noResultTitle")}
            description={t("noResultText")}
            action={<Button asChild><Link href={routes.test(testId)}>{t("startTest")}</Link></Button>}
          />
        </div>
      </main>
    );
  }

  const canRetake = !summary || summary.attemptsAllowed === 0 || (summary.attemptsUsed ?? 0) < summary.attemptsAllowed;

  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo href={routes.dashboard} />
          <Button asChild variant="ghost" size="sm">
            <Link href={routes.subject(result.subjectSlug)}>{t("backToSubject")}</Link>
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="container-page max-w-4xl space-y-6 py-8 outline-none sm:py-12">
        <ScoreSummary result={result} />
        <ProgressUpdate result={result} />

        <div className="mx-auto flex w-full max-w-xl flex-col gap-3 sm:flex-row">
          {result.reviewHidden ? null : (
            <Button asChild size="lg" className="flex-1">
              <a href="#review">{t("review")}</a>
            </Button>
          )}
          {canRetake ? (
            <Button asChild size="lg" variant="outline-primary" className="flex-1">
              <Link href={routes.test(result.testId)}>{t("retake")}</Link>
            </Button>
          ) : (
            <Button asChild size="lg" variant="outline" className="flex-1">
              <Link href={routes.subject(result.subjectSlug)}>{t("backToSubject")}</Link>
            </Button>
          )}
        </div>
        {!result.reviewHidden && result.incorrect + result.unanswered > 0 ? (
          <p className="text-center"><Button asChild variant="ghost" size="sm"><Link href={routes.mistakes}>{t("allMistakes")}</Link></Button></p>
        ) : null}
        {summary && summary.attemptsAllowed > 0 ? (
          <p className="text-center text-sm text-muted-foreground" data-attempts-note>
            {canRetake ? t("attemptsLeft", { left: summary.attemptsAllowed - (summary.attemptsUsed ?? 0) }) : t("noAttemptsLeft")}
          </p>
        ) : null}
        {history.length > 1 ? <AttemptHistory items={history} current={result.attemptId} /> : null}

        <div className="pt-6">
          {result.reviewHidden ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground" data-review-hidden={result.reviewHidden}>
              {result.reviewHidden === "after_close" ? t("reviewAfterClose") : t("reviewNever")}
            </p>
          ) : <ReviewList items={result.review} />}
        </div>
      </main>
    </>
  );
}
