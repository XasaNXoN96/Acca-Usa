"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";
import { services } from "@/services";
import { getSessionForConsent } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/redirect";
import { isLocale } from "@/i18n/config";
import { revalidatePath } from "next/cache";

const acceptSchema = z.object({ terms: z.literal(true), privacy: z.literal(true), marketing: z.boolean().optional() });

export type ConsentActionResult = { ok: true; redirectTo: string } | { ok: false; code: "FORBIDDEN" | "INVALID" };

/** The signed-in user accepts the CURRENT texts (first sign-in after an update, or an account created by an administrator). */
export async function acceptConsentAction(input: unknown, next?: string | null): Promise<ConsentActionResult> {
  const loaded = await getSessionForConsent();
  if (!loaded) return { ok: false, code: "FORBIDDEN" };
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const locale = await getLocale();
  await services.consent.record(loaded.session.user.id, [
    { kind: "terms", granted: true }, { kind: "privacy", granted: true },
    // optional marketing is recorded only when actively ticked; withdrawing it is done in the profile
    ...(parsed.data.marketing === true ? [{ kind: "marketing" as const, granted: true }] : []),
  ], { locale: isLocale(locale) ? locale : "en", source: "reconsent" });
  return { ok: true, redirectTo: safeNext(next) ?? homeFor(loaded.session.user.role) };
}

/** Optional marketing e-mail preference: can be switched on and off at any time; every change is a new history record. */
export async function setMarketingConsentAction(granted: boolean): Promise<{ ok: boolean }> {
  const loaded = await getSessionForConsent();
  if (!loaded || loaded.consentRequired) return { ok: false };
  if (typeof granted !== "boolean") return { ok: false };
  const locale = await getLocale();
  await services.consent.record(loaded.session.user.id, [{ kind: "marketing", granted }], { locale: isLocale(locale) ? locale : "en", source: "settings" });
  revalidatePath("/profile");
  return { ok: true };
}
