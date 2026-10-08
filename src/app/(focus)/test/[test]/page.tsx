import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TestRunner } from "@/features/test/test-runner";
import { TestIntro } from "@/features/test/test-intro";
import { requireSession } from "@/lib/auth/guards";
import { services } from "@/services";
import { routes } from "@/lib/routes";

type Params = Promise<{ test: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = await services.tests.getSummary((await params).test);
  return { title: s?.title ?? "Test" };
}

export default async function TestPage({ params }: { params: Params }) {
  const { test: testId } = await params;
  const session = await requireSession();
  const test = await services.tests.getForAttempt(testId, session.user.id);
  if (!test) notFound();

  const subject = await services.subjects.getBySlug(test.subjectSlug);
  if (!subject) notFound();
  if (!(await services.enrollments.isEnrolled(session.user.id, subject.platform))) redirect(routes.coursePlatform(subject.platform));

  const active = await services.tests.getActiveAttempt(session.user.id, testId);
  if (!active) return <TestIntro test={test} />;
  return <TestRunner test={test} draft={active.draft} exitHref={routes.subjectTab(test.subjectSlug, "tests")} />;
}
