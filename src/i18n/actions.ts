"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LOCALE_COOKIE, locales } from "./config";

const schema = z.enum(locales);

export async function setLocaleAction(input: string) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  (await cookies()).set(LOCALE_COOKIE, parsed.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
