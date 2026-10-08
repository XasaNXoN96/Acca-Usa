"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { assertCan } from "@/lib/permissions";

const id = z.string().min(1).max(160);
const draftSchema = z.object({
  testId: id,
  answers: z.record(id, id).refine((a) => Object.keys(a).length <= 500),
  flagged: z.array(id).max(500),
  currentIndex: z.number().int().min(0).max(1000),
  elapsedSeconds: z.number().min(0).max(60 * 60 * 12),
});

export async function saveDraftAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const session = await services.auth.getSession("STUDENT");
  assertCan(session.user.role, "learn");
  await services.tests.saveDraft(session.user.id, parsed.data);
  return { ok: true };
}

const submitSchema = draftSchema.pick({ testId: true, answers: true, flagged: true, elapsedSeconds: true });

export async function submitTestAction(raw: unknown): Promise<{ ok: true; attemptId: string } | { ok: false }> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const session = await services.auth.getSession("STUDENT");
  assertCan(session.user.role, "learn");
  try {
    const { attemptId } = await services.tests.submit({ userId: session.user.id, ...parsed.data });
    revalidatePath(routes.dashboard);
    revalidatePath(routes.progress);
    return { ok: true, attemptId };
  } catch {
    return { ok: false };
  }
}
