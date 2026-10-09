"use server";

import { headers } from "next/headers";
import { services } from "@/services";
import { getSessionForMfaSetup, startSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { mfaCodeSchema } from "@/lib/validators/auth";

export type ConfirmMfaResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; code: "FORBIDDEN" | "INVALID_INPUT" | "INVALID_CODE" | "RATE_LIMITED" | "ALREADY_ENABLED" | "FAILED"; retryMinutes?: number };

/**
 * Confirms the authenticator app by a live code. Only an administrator's own session may do this (also while the mandatory
 * enrolment is still pending). On success every older session is revoked and THIS one is re-issued as second-factor-verified.
 */
export async function confirmMfaAction(input: unknown): Promise<ConfirmMfaResult> {
  const loaded = await getSessionForMfaSetup();
  if (!loaded || loaded.session.user.role !== "ADMIN") return { ok: false, code: "FORBIDDEN" };
  const parsed = mfaCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const h = await headers();
  const rl = await rateLimit(`mfa-enroll:${loaded.session.user.id}:${(h.get("x-forwarded-for") ?? "local").slice(0, 64)}`, 8, 10 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const res = await services.mfa.confirmEnrollment(loaded.session.user.id, parsed.data.code);
  if (!res.ok) return { ok: false, code: res.code === "INVALID_CODE" ? "INVALID_CODE" : res.code === "ALREADY_ENABLED" ? "ALREADY_ENABLED" : "FAILED" };
  await startSession(loaded.session.user, res.data.tokenVersion, { mfa: true });
  return { ok: true, recoveryCodes: res.data.recoveryCodes };
}
