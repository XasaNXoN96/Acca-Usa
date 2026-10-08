import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { services, type Session } from "@/services";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "./token";
import { isDemoMode } from "@/lib/app-mode";
import type { User } from "@/types";
import {  } from "@/lib/auth/guards";

/** Issues the session cookie: httpOnly (no JS access), SameSite=Lax, Secure in production. */
export async function startSession(user: Pick<User, "id" | "role">, tokenVersion: number) {
  const token = signSession({ uid: user.id, role: user.role, v: tokenVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/**
 * Authoritative session lookup: verifies the signature, then RE-READS the user, so a suspended
 * account, a changed role or a password reset takes effect on the very next request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const claims = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await services.auth.getSessionUser(claims.uid, claims.v);
  return user ? { user, isDemo: isDemoMode } : null;
});
