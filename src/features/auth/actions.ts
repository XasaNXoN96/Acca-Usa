"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { services } from "@/services";
import { clearMfaChallenge, endSession, pendingMfa, startMfaChallenge, startSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/redirect";
import { audit } from "@/lib/audit";
import { rateLimit, rateLimitClear } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/app-mode";
import { routes } from "@/lib/routes";
import { forgotSchema, loginSchema, mfaCodeSchema, registerSchema, resetSchema } from "@/lib/validators/auth";
import { isLocale } from "@/i18n/config";
import { absoluteUrl, sendEmail } from "@/services/email";
import { RESET_TTL_MINUTES } from "@/services/auth-constants";

/**
 * Auth server actions. Input is ALWAYS re-validated here (the browser is not trusted), attempts
 * are rate-limited, and credentials are only ever compared as scrypt hashes inside the service.
 * Passwords are never logged, returned, or stored anywhere in plaintext.
 */
export type AuthResult =
  | { ok: true; redirectTo: string }
  | { ok: false; code: "INVALID_INPUT" | "INVALID_CREDENTIALS" | "SUSPENDED" | "EMAIL_TAKEN" | "RATE_LIMITED" | "INVALID_TOKEN" | "INVALID_CODE" | "NO_CHALLENGE"; retryMinutes?: number };

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local").slice(0, 64);
}

export async function loginAction(input: unknown, next?: string | null): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const email = parsed.data.email.toLowerCase();

  const rl = await rateLimit(`login:${await clientKey()}:${email}`, 8, 10 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const res = await services.auth.verifyCredentials(email, parsed.data.password);
  if ("error" in res) return { ok: false, code: res.error === "SUSPENDED" ? "SUSPENDED" : "INVALID_CREDENTIALS" };

  // A correct password is only the FIRST factor for an administrator who enrolled a second one: no session is issued here.
  if ((await services.mfa.status(res.user.id)).enabled) {
    await startMfaChallenge(res.user.id, res.tokenVersion, safeNext(next) ?? undefined);
    return { ok: true, redirectTo: routes.loginMfa };
  }
  await startSession(res.user, res.tokenVersion);
  if (res.user.role === "ADMIN") await audit({ actor: { type: "admin", id: res.user.id, email: res.user.email }, action: "auth.login", target: { type: "session" }, meta: { mfa: false } });
  return { ok: true, redirectTo: safeNext(next) ?? homeFor(res.user.role) };
}

/** Second step of sign-in. The only way to turn a pending challenge into a session; attempts are rate-limited per account AND per client. */
export async function verifyMfaAction(input: unknown): Promise<AuthResult> {
  const parsed = mfaCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const pending = await pendingMfa();
  if (!pending) return { ok: false, code: "NO_CHALLENGE" };

  const [byUser, byClient] = await Promise.all([rateLimit(`mfa:u:${pending.uid}`, 6, 10 * 60_000), rateLimit(`mfa:c:${await clientKey()}`, 20, 10 * 60_000)]);
  const rl = !byUser.ok ? byUser : byClient;
  if (!rl.ok) {
    await audit({ actor: { type: "admin", id: pending.uid }, action: "auth.mfa_locked", target: { type: "session" }, outcome: "denied" });
    return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };
  }

  // The account must still be the one that passed the password step (not suspended / signed out since).
  const user = await services.auth.getSessionUser(pending.uid, pending.v);
  if (!user) { await clearMfaChallenge(); return { ok: false, code: "NO_CHALLENGE" }; }
  const res = await services.mfa.verifyLogin(user.id, parsed.data.code);
  if (!res.ok) {
    await audit({ actor: { type: "admin", id: user.id, email: user.email }, action: "auth.mfa_failed", target: { type: "session" }, outcome: "failed" });
    return { ok: false, code: "INVALID_CODE" };
  }

  await clearMfaChallenge();
  await rateLimitClear(`mfa:u:${pending.uid}`); // only FAILED attempts count towards the lockout
  await startSession(user, pending.v, { mfa: true });
  await audit({ actor: { type: "admin", id: user.id, email: user.email }, action: "auth.login", target: { type: "session" }, meta: { mfa: true, method: res.method } });
  return { ok: true, redirectTo: safeNext(pending.next) ?? homeFor(user.role) };
}

export async function cancelMfaAction(): Promise<void> {
  await clearMfaChallenge();
  redirect(routes.login);
}

export async function registerAction(input: unknown, next?: string | null): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  const rl = await rateLimit(`register:${await clientKey()}`, 10, 60 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const locale = await getLocale();
  const created = await services.auth.register({
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    locale: isLocale(locale) ? locale : "en",
  });
  if (!created.ok) return { ok: false, code: "EMAIL_TAKEN" };
  // After the response: a slow or failing mail server must not delay (or break) registration.
  after(() => sendEmail({ email: created.data.email, locale: created.data.locale }, { kind: "welcome", name: created.data.name }));

  // Self-registration only ever creates a STUDENT; staff roles are granted by an administrator.
  const login = await services.auth.verifyCredentials(parsed.data.email, parsed.data.password);
  if ("error" in login) return { ok: false, code: "INVALID_CREDENTIALS" };
  await startSession(login.user, login.tokenVersion);
  return { ok: true, redirectTo: safeNext(next) ?? routes.dashboard };
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect(routes.login);
}

export type ForgotResult =
  | { ok: true; demoResetPath?: string }
  | { ok: false; code: "INVALID_INPUT" | "RATE_LIMITED"; retryMinutes?: number };

export async function forgotPasswordAction(input: unknown): Promise<ForgotResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const rl = await rateLimit(`forgot:${await clientKey()}`, 5, 15 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const res = await services.auth.requestPasswordReset(parsed.data.email);
  // The response is identical whether or not the account exists. The link goes out by e-mail (the demo provider only
  // records it); in DEMO mode ONLY it is also shown on screen so the flow can be tried without a mailbox.
  if (res) {
    const resetPath = `${routes.resetPassword}?token=${encodeURIComponent(res.token)}`;
    // After the response, so response time does not reveal whether the account exists.
    after(() => sendEmail({ email: res.user.email, locale: res.user.locale }, { kind: "passwordReset", name: res.user.name, resetUrl: absoluteUrl(resetPath), expiresMinutes: RESET_TTL_MINUTES }));
    if (isDemoMode) return { ok: true, demoResetPath: resetPath };
  }
  return { ok: true };
}

export async function resetPasswordAction(input: unknown): Promise<AuthResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const rl = await rateLimit(`reset:${await clientKey()}`, 10, 15 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const ok = await services.auth.resetPassword(parsed.data.token, parsed.data.password);
  if (!ok) return { ok: false, code: "INVALID_TOKEN" };
  await endSession();
  return { ok: true, redirectTo: `${routes.login}?reset=1` };
}
