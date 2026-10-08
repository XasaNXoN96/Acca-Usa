"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { assertCan } from "@/lib/permissions";

const input = z.object({ topicId: z.string().min(1).max(160) });

export async function markTopicCompletedAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };

  const session = await services.auth.getSession("STUDENT");
  assertCan(session.user.role, "learn");

  const ctx = await services.topics.getContext(parsed.data.topicId, session.user.id);
  // Server-side lock check: the UI hides the button for locked topics, but the server decides.
  if (!ctx || ctx.topic.status === "locked") return { ok: false };

  await services.progress.markTopicCompleted(session.user.id, ctx.topic.id);
  revalidatePath(routes.topic(ctx.topic.id));
  revalidatePath(routes.subject(ctx.subject.slug));
  revalidatePath(routes.dashboard);
  return { ok: true };
}
