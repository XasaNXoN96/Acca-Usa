import { timingSafeEqual } from "node:crypto";

/**
 * What the bot does with messages people send to it (Telegram calls our webhook). Pure logic with injected dependencies, tested without Telegram.
 *   /start <token>   binds this chat to the administrator who pressed "Connect Telegram" (second-factor codes go here)
 *   /start, /id      replies with this chat's id (how the operator finds TELEGRAM_CHAT_ID)
 *   anything else    a message to the team: forwarded to the ops chat (support), at most 5 per 10 minutes per chat
 * The ops chat itself is ignored (the owner talking to their own bot).
 */
export interface TgUpdate {
  message?: { text?: string; chat?: { id?: number; type?: string }; from?: { id?: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean } };
}
export interface WebhookDeps {
  opsChatId: string;
  reply(chatId: string, html: string): Promise<unknown>;
  forwardToTeam(html: string): void | Promise<unknown>;
  completeLink(token: string, chat: { id: string; username?: string }): Promise<{ ok: true; userId: string; userName: string } | { ok: false }>;
  onLinked?(info: { userId: string; userName: string }): void;
  now?: () => number;
}

export const secretMatches = (header: string | null, secret: string): boolean => {
  if (!header || !secret) return false;
  const a = Buffer.from(header), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const seen = new Map<string, number[]>();
export const resetWebhookState = () => seen.clear();

export async function handleUpdate(update: TgUpdate, deps: WebhookDeps): Promise<void> {
  const m = update.message;
  const chatId = m?.chat?.id;
  const text = typeof m?.text === "string" ? m.text.trim() : "";
  if (!m || typeof chatId !== "number" || !text || m.from?.is_bot) return;
  const chat = String(chatId);
  const isPrivate = m.chat?.type === "private";
  const now = (deps.now ?? Date.now)();

  const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+(\S+))?/i.exec(text);
  if (cmd) {
    const name = cmd[1]!.toLowerCase();
    if (name === "start" && cmd[2] && isPrivate) {
      const res = await deps.completeLink(cmd[2], { id: chat, username: m.from?.username });
      if (res.ok) {
        await deps.reply(chat, `✅ Connected to the administrator account <b>${esc(res.userName)}</b>.\nSign-in codes can now be sent to this chat. If you did not do this, open the site and remove the connection.`);
        deps.onLinked?.({ userId: res.userId, userName: res.userName });
      } else await deps.reply(chat, "⚠️ This link is invalid, expired or already used. Open the site → Admin → Security and press “Connect Telegram” again.");
      return;
    }
    if (name === "start" || name === "id") {
      await deps.reply(chat, `Chat id: <code>${esc(chat)}</code>`);
      return;
    }
    if (name === "help") { await deps.reply(chat, "Write your question here and the ACCA USA team will receive it."); return; }
    return; // other commands: ignored
  }

  if (chat === deps.opsChatId) return; // the owner's own chat
  const recent = (seen.get(chat) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 5) { seen.set(chat, recent); return; } // flood: silently dropped
  seen.set(chat, [...recent, now]);
  if (seen.size > 2000) for (const [k, v] of seen) if (v.every((t) => now - t >= 10 * 60_000)) seen.delete(k);
  const who = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || "unknown";
  await deps.forwardToTeam(`<b>Message to the bot</b>\nFrom: ${esc(who)}${m.from?.username ? ` (@${esc(m.from.username)})` : ""}\nChat id: <code>${esc(chat)}</code>\n\n${esc(text.slice(0, 1500))}`);
  if (recent.length === 0) await deps.reply(chat, "Thank you! Your message was sent to the team.");
}
