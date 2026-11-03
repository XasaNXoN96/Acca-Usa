"use server";

import { headers } from "next/headers";
import { services } from "@/services";
import { getSessionForMfaSetup, startSession } from "@/lib/auth/session";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { sendTelegram, telegramConfigured } from "@/services/telegram/client";
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


// ── Telegram: link / unlink / test (the second factor next to the authenticator app, and the administrator's notification chat)
export type TelegramLinkState = { configured: boolean; linked: boolean; username?: string; botUsername?: string };

async function adminOnly() {
  const session = await sessionOrNull(STAFF_ROLES);
  return session && session.user.role === "ADMIN" ? session : null;
}

export async function telegramStateAction(): Promise<TelegramLinkState> {
  const session = await adminOnly();
  const configured = telegramConfigured() && !!process.env.TELEGRAM_BOT_USERNAME;
  if (!session || !configured) return { configured, linked: false };
  const st = await services.telegramAuth.status(session.user.id);
  return { configured, linked: st.linked, username: st.username, botUsername: process.env.TELEGRAM_BOT_USERNAME };
}

/** "Connect Telegram": returns the deep link that opens the bot with a one-time token. */
export async function beginTelegramLinkAction(): Promise<{ ok: true; url: string } | { ok: false; code: "FORBIDDEN" | "NOT_CONFIGURED" | "RATE_LIMITED" | "FAILED" }> {
  const session = await adminOnly();
  if (!session) return { ok: false, code: "FORBIDDEN" };
  if (!telegramConfigured() || !process.env.TELEGRAM_BOT_USERNAME) return { ok: false, code: "NOT_CONFIGURED" };
  if (!(await rateLimit(`tg-link:${session.user.id}`, 10, 60 * 60_000)).ok) return { ok: false, code: "RATE_LIMITED" };
  const res = await services.telegramAuth.beginLink(session.user.id);
  if (!res.ok) return { ok: false, code: "FAILED" };
  return { ok: true, url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${res.data.token}` };
}

export async function unlinkTelegramAction(): Promise<{ ok: boolean }> {
  const session = await adminOnly();
  if (!session) return { ok: false };
  const res = await services.telegramAuth.unlink(session.user.id);
  if (res.ok) await audit({ actor: adminActor(session.user), action: "mfa.telegram_unlinked", target: { type: "user", id: session.user.id } });
  return { ok: res.ok };
}

/** Sends a test message to the linked chat so the administrator can see that the connection works. */
export async function sendTelegramTestAction(): Promise<{ ok: boolean; code?: "RATE_LIMITED" | "FAILED" }> {
  const session = await adminOnly();
  if (!session) return { ok: false, code: "FAILED" };
  if (!(await rateLimit(`tg-test:${session.user.id}`, 5, 60 * 60_000)).ok) return { ok: false, code: "RATE_LIMITED" };
  const chat = await services.telegramAuth.chatOf(session.user.id);
  if (!chat) return { ok: false, code: "FAILED" };
  const sent = await sendTelegram(chat, "✅ <b>ACCA USA</b>\nTelegram is connected to your administrator account. Sign-in codes will arrive here.");
  return sent ? { ok: true } : { ok: false, code: "FAILED" };
}
