"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sessionOrNull } from "@/lib/auth/guards";
import { logEvent } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { escapeHtml, sendTelegram, telegramConfigured } from "@/services/telegram/client";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(2000),
  website: z.string().max(200).optional().default(""), // honeypot: real people never see or fill it
});

export type SupportResult = { ok: true } | { ok: false; code: "INVALID" | "RATE_LIMITED" | "NOT_CONFIGURED" | "FAILED" };

/** Support form → the team's Telegram chat. No message text is ever logged. */
export async function sendSupportMessageAction(input: unknown): Promise<SupportResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  if (parsed.data.website) return { ok: true }; // a bot: pretend it worked, send nothing
  if (!telegramConfigured()) return { ok: false, code: "NOT_CONFIGURED" };
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local").slice(0, 64);
  const [byIp, byMail] = await Promise.all([rateLimit(`support:ip:${ip}`, 5, 60 * 60_000), rateLimit(`support:mail:${parsed.data.email.toLowerCase()}`, 5, 60 * 60_000)]);
  if (!byIp.ok || !byMail.ok) return { ok: false, code: "RATE_LIMITED" };
  const session = await sessionOrNull();
  const who = session ? `${session.user.role === "ADMIN" ? "administrator" : "student"} (signed in)` : "visitor";
  const sent = await sendTelegram(process.env.TELEGRAM_CHAT_ID!, `💬 <b>Support message</b>\nFrom: ${escapeHtml(parsed.data.name)} &lt;${escapeHtml(parsed.data.email)}&gt;\nWho: ${who}\n\n${escapeHtml(parsed.data.message)}`);
  logEvent(sent ? "info" : "warn", sent ? "support.message" : "support.not_delivered");
  return sent ? { ok: true } : { ok: false, code: "FAILED" };
}
