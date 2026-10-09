"use server";

import { headers } from "next/headers";
import { services } from "@/services";
import { getSessionForMfaSetup, startSession } from "@/lib/auth/session";
import { audit, adminActor } from "@/lib/audit";
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
  if (!res.ok) {
    if (res.code === "INVALID_CODE") await audit({ actor: adminActor(loaded.session.user), action: "mfa.enroll_failed", target: { type: "user", id: loaded.session.user.id }, outcome: "failed" });
    return { ok: false, code: res.code === "INVALID_CODE" ? "INVALID_CODE" : res.code === "ALREADY_ENABLED" ? "ALREADY_ENABLED" : "FAILED" };
  }
  await startSession(loaded.session.user, res.data.tokenVersion, { mfa: true });
  await audit({ actor: adminActor(loaded.session.user), action: "mfa.enabled", target: { type: "user", id: loaded.session.user.id } });
  return { ok: true, recoveryCodes: res.data.recoveryCodes };
}
