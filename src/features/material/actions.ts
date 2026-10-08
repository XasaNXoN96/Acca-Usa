"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { routes } from "@/lib/routes";
import { sessionOrNull } from "@/lib/auth/guards";

const input = z.object({ materialId: z.string().min(1).max(200), completed: z.boolean() });

/**
 * Marks a material completed / not completed for the CURRENT user. Everything is re-checked on the server:
 * session, that the material belongs to a visible topic, and (for students) enrolment + an unlocked topic.
 */
export async function setMaterialCompletedAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const session = await sessionOrNull();
  if (!session) return { ok: false };
  const material = await services.materials.getById(parsed.data.materialId);
  if (!material || material.archived || !material.topicId) return { ok: false };
  const ctx = await services.topics.getContext(material.topicId, session.user.id);
  if (!ctx || !ctx.materials.some((m) => m.id === material.id)) return { ok: false };
  if (session.user.role === "STUDENT") {
    if (ctx.topic.status === "locked") return { ok: false };
    if (!(await services.enrollments.isEnrolled(session.user.id, ctx.subject.platform))) return { ok: false };
  }
  await services.progress.setMaterialCompleted(session.user.id, material.id, parsed.data.completed);
  if (parsed.data.completed) await services.progress.touchTopic(session.user.id, ctx.topic.id);
  revalidatePath(routes.subjectMaterial(ctx.subject.slug, ctx.topic.id, material.id));
  revalidatePath(routes.subjectTopic(ctx.subject.slug, ctx.topic.id));
  return { ok: true };
}
