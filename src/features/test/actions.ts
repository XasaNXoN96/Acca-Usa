"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { sessionOrNull } from "@/lib/auth/guards";

const id = z.string().min(1).max(160);
const draftSchema = z.object({
  testId: id,
  answers: z.record(id, id).refine((a) => Object.keys(a).length <= 500),
  flagged: z.array(id).max(500),
  currentIndex: z.number().int().min(0).max(1000),
});

/** Learner must be signed in AND enrolled in the test's platform — checked on every call. */
async function learnerFor(testId: string) {
  const session = await sessionOrNull();
  if (!session) return null;
  const summary = await services.tests.getSummary(testId);
  const subject = summary && (await services.subjects.getBySlug(summary.subjectSlug));
  if (!summary || !subject) return null;
  if (!(await services.enrollments.isEnrolled(session.user.id, subject.platform))) return null;
  return session;
}

export async function startTestAction(raw: unknown): Promise<{ ok: boolean; code?: string }> {
  const parsed = z.object({ testId: id }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const session = await learnerFor(parsed.data.testId);
  if (!session) return { ok: false, code: "FORBIDDEN" };
  const res = await services.tests.startAttempt(session.user.id, parsed.data.testId);
  revalidatePath(routes.test(parsed.data.testId));
  return res.ok ? { ok: true } : { ok: false, code: res.code };
}

/** Autosave. The elapsed time is NOT accepted from the browser — the server clock owns the timer. */
export async function saveDraftAction(raw: unknown): Promise<{ ok: boolean; expired?: boolean }> {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const session = await learnerFor(parsed.data.testId);
  if (!session) return { ok: false };
  const res = await services.tests.saveDraft(session.user.id, { ...parsed.data, elapsedSeconds: 0 });
  return res.ok ? { ok: true } : { ok: false, expired: res.code === "EXPIRED" };
}

const submitSchema = draftSchema.pick({ testId: true, answers: true, flagged: true });

export async function submitTestAction(raw: unknown): Promise<{ ok: true; attemptId: string } | { ok: false; code: string }> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const session = await learnerFor(parsed.data.testId);
  if (!session) return { ok: false, code: "FORBIDDEN" };
  const res = await services.tests.submit({ userId: session.user.id, ...parsed.data });
  if (!res.ok) return { ok: false, code: res.code };
  revalidatePath(routes.dashboard);
  revalidatePath(routes.progress);
  return { ok: true, attemptId: res.data.attemptId };
}
