"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { services } from "@/services";
import { endSession, startSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/guards";
import { safeNext } from "@/lib/auth/redirect";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/app-mode";
import { routes } from "@/lib/routes";
import { forgotSchema, loginSchema, registerSchema, resetSchema } from "@/lib/validators/auth";
import { isLocale } from "@/i18n/config";

/**
 * Auth server actions. Input is ALWAYS re-validated here (the browser is not trusted), attempts
 * are rate-limited, and credentials are only ever compared as scrypt hashes inside the service.
 * Passwords are never logged, returned, or stored anywhere in plaintext.
 */
export type AuthResult =
  | { ok: true; redirectTo: string }
  | { ok: false; code: "INVALID_INPUT" | "INVALID_CREDENTIALS" | "SUSPENDED" | "EMAIL_TAKEN" | "RATE_LIMITED" | "INVALID_TOKEN"; retryMinutes?: number };

async function clientKey() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local").slice(0, 64);
}

export async function loginAction(input: unknown, next?: string | null): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const email = parsed.data.email.toLowerCase();

  const rl = rateLimit(`login:${await clientKey()}:${email}`, 8, 10 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const res = await services.auth.verifyCredentials(email, parsed.data.password);
  if ("error" in res) return { ok: false, code: res.error === "SUSPENDED" ? "SUSPENDED" : "INVALID_CREDENTIALS" };

  await startSession(res.user, res.tokenVersion);
  return { ok: true, redirectTo: safeNext(next) ?? homeFor(res.user.role) };
}

export async function registerAction(input: unknown): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };

  const rl = rateLimit(`register:${await clientKey()}`, 10, 60 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const locale = await getLocale();
  const created = await services.auth.register({
    name: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
    locale: isLocale(locale) ? locale : "en",
  });
  if (!created.ok) return { ok: false, code: "EMAIL_TAKEN" };

  // Self-registration only ever creates a STUDENT; staff roles are granted by an administrator.
  const login = await services.auth.verifyCredentials(parsed.data.email, parsed.data.password);
  if ("error" in login) return { ok: false, code: "INVALID_CREDENTIALS" };
  await startSession(login.user, login.tokenVersion);
  return { ok: true, redirectTo: routes.dashboard };
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
  const rl = rateLimit(`forgot:${await clientKey()}`, 5, 15 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const res = await services.auth.requestPasswordReset(parsed.data.email);
  // The response is identical whether or not the account exists. In DEMO mode only, the link is shown
  // on screen because no email provider exists; production mode sends it by email and shows nothing.
  if (res && isDemoMode) return { ok: true, demoResetPath: `${routes.resetPassword}?token=${encodeURIComponent(res.token)}` };
  return { ok: true };
}

export async function resetPasswordAction(input: unknown): Promise<AuthResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT" };
  const rl = rateLimit(`reset:${await clientKey()}`, 10, 15 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED", retryMinutes: Math.ceil(rl.retryAfterSeconds / 60) };

  const ok = await services.auth.resetPassword(parsed.data.token, parsed.data.password);
  if (!ok) return { ok: false, code: "INVALID_TOKEN" };
  await endSession();
  return { ok: true, redirectTo: `${routes.login}?reset=1` };
}
