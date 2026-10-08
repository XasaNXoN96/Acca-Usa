"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { sessionOrNull } from "@/lib/auth/guards";

const platform = z.enum(["acca", "fia"]);

/** Enrolment is free in demo mode. Real access control will hang off a paid entitlement later. */
export async function enrollAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = platform.safeParse(raw);
  const session = await sessionOrNull();
  if (!parsed.success || !session) return { ok: false };
  const res = await services.enrollments.enroll(session.user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: res.ok };
}

export async function leaveAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = platform.safeParse(raw);
  const session = await sessionOrNull();
  if (!parsed.success || !session) return { ok: false };
  const res = await services.enrollments.leave(session.user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: res.ok };
}
