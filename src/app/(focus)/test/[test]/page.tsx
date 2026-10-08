import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TestRunner } from "@/features/test/test-runner";
import { services } from "@/services";
import { routes } from "@/lib/routes";

type Params = Promise<{ test: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const s = await services.tests.getSummary((await params).test);
  return { title: s?.title ?? "Test" };
}

export default async function TestPage({ params }: { params: Params }) {
  const { test: testId } = await params;
  const session = await services.auth.getSession("STUDENT");
  const [test, draft] = await Promise.all([services.tests.getForAttempt(testId), services.tests.loadDraft(session.user.id, testId)]);
  if (!test) notFound();
  return <TestRunner test={test} draft={draft} exitHref={routes.subjectTab(test.subjectSlug, "tests")} />;
}
