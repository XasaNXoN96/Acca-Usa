"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { sessionOrNull } from "@/lib/auth/guards";
import { setLocaleAction } from "@/i18n/actions";
import { locales } from "@/i18n/config";

const schema = z.object({ name: z.string().trim().min(2).max(80), language: z.enum(locales) });

/** Saves the SIGNED-IN user's own name and language. The target user is the session's — never taken from the request. */
export async function saveProfileAction(input: unknown): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse(input);
  const session = await sessionOrNull();
  if (!parsed.success || !session) return { ok: false };
  const res = await services.users.updateProfile(session.user.id, { name: parsed.data.name, locale: parsed.data.language });
  if (!res.ok) return { ok: false };
  await setLocaleAction(parsed.data.language);
  revalidatePath("/", "layout");
  return { ok: true };
}
