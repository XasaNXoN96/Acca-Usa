import { json } from "@/lib/api-guards";
import { logEvent } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { services } from "@/services";
import { sendTelegram, telegramConfigured } from "@/services/telegram/client";
import { notifyOps } from "@/services/telegram/notify";
import { handleUpdate, secretMatches, type TgUpdate } from "@/services/telegram/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;

/**
 * POST /api/telegram/webhook — Telegram delivers messages sent to the bot here (registered by `npm run telegram:setup`).
 * Authenticated by the secret token Telegram echoes in X-Telegram-Bot-Api-Secret-Token (constant-time compare). 404 unless configured.
 */
export async function POST(req: Request) {
  if (!telegramConfigured() || !process.env.TELEGRAM_WEBHOOK_SECRET) return json({ ok: false }, 404);
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    logEvent("warn", "telegram.webhook_rejected");
    return json({ ok: false }, 401);
  }
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 64);
  if (!(await rateLimit(`tg-hook:${ip}`, 600, 60_000)).ok) return json({ ok: false }, 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false }, 413);
  let update: TgUpdate;
  try { update = JSON.parse((await req.text()).slice(0, MAX_BODY)) as TgUpdate; } catch { return json({ ok: false }, 400); }
  try {
    await handleUpdate(update, {
      opsChatId: process.env.TELEGRAM_CHAT_ID!,
      reply: (chat, html) => sendTelegram(chat, html),
      forwardToTeam: (html) => sendTelegram(process.env.TELEGRAM_CHAT_ID!, `💬 ${html}`),
      completeLink: (token, chat) => services.telegramAuth.completeLink(token, chat),
      onLinked: (i) => notifyOps("security", "Telegram connected to an administrator account", [`admin: ${i.userName}`]),
    });
  } catch (e) {
    logEvent("error", "telegram.webhook_failed", { error: e instanceof Error ? e.name : "unknown" });
  }
  return json({ ok: true }); // always 200 once authenticated: Telegram must not retry a message we already looked at
}
