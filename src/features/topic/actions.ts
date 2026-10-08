"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { sessionOrNull } from "@/lib/auth/guards";

const input = z.object({ topicId: z.string().min(1).max(160) });

async function allowed(topicId: string) {
  const session = await sessionOrNull();
  if (!session) return null;
  const ctx = await services.topics.getContext(topicId, session.user.id);
  // Server-side checks: topic exists, is not locked, and the learner is enrolled in its platform.
  if (!ctx || ctx.topic.status === "locked") return null;
  if (!(await services.enrollments.isEnrolled(session.user.id, ctx.subject.platform))) return null;
  return { session, ctx };
}

export async function touchTopicAction(raw: unknown): Promise<void> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return;
  const a = await allowed(parsed.data.topicId);
  if (!a) return;
  await services.progress.touchTopic(a.session.user.id, a.ctx.topic.id);
  revalidatePath(routes.dashboard);
}

export async function markTopicCompletedAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const a = await allowed(parsed.data.topicId);
  if (!a) return { ok: false };
  await services.progress.markTopicCompleted(a.session.user.id, a.ctx.topic.id);
  revalidatePath(routes.subjectTopic(a.ctx.subject.slug, a.ctx.topic.id));
  revalidatePath(routes.subject(a.ctx.subject.slug));
  revalidatePath(routes.dashboard);
  return { ok: true };
}
