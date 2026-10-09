import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { services, type Session } from "@/services";
import { MFA_PENDING_COOKIE, MFA_PENDING_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_SECONDS, signPendingMfa, signSession, verifyPendingMfa, verifySession, type PendingClaims } from "./token";
import { mfaRequiredFor } from "./mfa-policy";
import { missingConsents } from "@/lib/legal/consent";
import { APP_MODE, isDemoMode } from "@/lib/app-mode";
import type { User } from "@/types";

/** Issues the session cookie: httpOnly (no JS access), SameSite=Lax, Secure in production. */
export async function startSession(user: Pick<User, "id" | "role">, tokenVersion: number, opts: { mfa?: boolean } = {}) {
  const token = signSession({ uid: user.id, role: user.role, v: tokenVersion, ...(opts.mfa ? { m: true } : {}) });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || APP_MODE === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Password accepted, second factor still owed: a short-lived cookie that is NOT a session (separate signing domain). */
export async function startMfaChallenge(userId: string, tokenVersion: number, next?: string) {
  (await cookies()).set(MFA_PENDING_COOKIE, signPendingMfa({ uid: userId, v: tokenVersion, ...(next ? { next } : {}) }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" || APP_MODE === "production", path: "/", maxAge: MFA_PENDING_TTL_SECONDS,
  });
}
export async function pendingMfa(): Promise<PendingClaims | null> {
  return verifyPendingMfa((await cookies()).get(MFA_PENDING_COOKIE)?.value);
}
export async function clearMfaChallenge() {
  (await cookies()).set(MFA_PENDING_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

type Loaded = { session: Session; setupRequired: boolean; consentRequired: boolean } | null;

/**
 * Authoritative session lookup: verifies the signature, then RE-READS the user, so a suspended
 * account, a changed role or a password reset takes effect on the very next request.
 *
 * Second factor (server-side, applies to EVERY route that reads the session — there is no alternative path around it):
 *  • an administrator who has MFA enabled needs `m` in the session token, otherwise there is no session at all;
 *  • an administrator who must have MFA (production) but has not enrolled yet gets NO session from `getSession` — only
 *    `getSessionForMfaSetup` (used by the admin shell, which then renders nothing but the enrolment screen).
 */
const loadSession = cache(async (): Promise<Loaded> => {
  const claims = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await services.auth.getSessionUser(claims.uid, claims.v);
  if (!user) return null;
  let setupRequired = false;
  if (user.role === "ADMIN") {
    const { enabled } = await services.mfa.status(user.id);
    if (enabled && claims.m !== true) return null;
    setupRequired = !enabled && mfaRequiredFor(user.role);
  }
  // Legal consent (terms + personal-data consent for the CURRENT text): until it is given nothing but the consent page works.
  const consentRequired = missingConsents(await services.consent.current(user.id)).length > 0;
  return { session: { user, isDemo: isDemoMode }, setupRequired, consentRequired };
});

export async function getSession(): Promise<Session | null> {
  const l = await loadSession();
  return l && !l.setupRequired && !l.consentRequired ? l.session : null;
}

/** Only for the enrolment screen / action: returns the session even while the mandatory second factor is not set up yet. */
export async function getSessionForMfaSetup(): Promise<{ session: Session; setupRequired: boolean; consentRequired: boolean } | null> {
  return loadSession();
}

/** For the consent page / action only: the signed-in user even though a required consent is still missing. */
export async function getSessionForConsent(): Promise<{ session: Session; consentRequired: boolean; setupRequired: boolean } | null> {
  return loadSession();
}
