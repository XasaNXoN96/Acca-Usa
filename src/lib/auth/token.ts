import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "./secret";
import type { Role } from "@/types";

/** Signed, stateless session token. Contains no password material. */
export interface SessionClaims {
  uid: string;
  role: Role;
  /** user.tokenVersion at issue time — bumping it revokes every older token */
  v: number;
  /** second factor completed in THIS session (administrators with MFA enabled need it) */
  m?: boolean;
  /** expiry, epoch seconds */
  exp: number;
}

export const SESSION_COOKIE = "acca_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function sign(payload: string): string {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

export function signSession(claims: Omit<SessionClaims, "exp">, ttl = SESSION_TTL_SECONDS): string {
  const payload = b64(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttl }));
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined | null): SessionClaims | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (typeof c.uid !== "string" || typeof c.exp !== "number" || c.exp < Date.now() / 1000) return null;
    if (c.role !== "STUDENT" && c.role !== "ADMIN") return null;
    return c;
  } catch {
    return null;
  }
}

/**
 * Short-lived "password accepted, second factor pending" token. It is signed with a DIFFERENT domain ("mfa.") than the session
 * cookie, so it can never be accepted as a session even if placed in the session cookie, and vice versa.
 */
export interface PendingClaims { uid: string; v: number; next?: string; exp: number }
export const MFA_PENDING_COOKIE = "acca_mfa";
export const MFA_PENDING_TTL_SECONDS = 5 * 60;

const signPending = (payload: string) => createHmac("sha256", getAuthSecret()).update(`mfa.${payload}`).digest("base64url");

export function signPendingMfa(claims: Omit<PendingClaims, "exp">): string {
  const payload = b64(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + MFA_PENDING_TTL_SECONDS }));
  return `${payload}.${signPending(payload)}`;
}

export function verifyPendingMfa(token: string | undefined | null): PendingClaims | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(signPending(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PendingClaims;
    if (typeof c.uid !== "string" || typeof c.v !== "number" || typeof c.exp !== "number" || c.exp < Date.now() / 1000) return null;
    return c;
  } catch {
    return null;
  }
}
