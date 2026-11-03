import "server-only";
import { logEvent } from "@/lib/log";

/**
 * Minimal Telegram Bot API client (fetch only, no library). The bot token lives in TELEGRAM_BOT_TOKEN on the server and is never logged,
 * never put in an error message and never sent anywhere except api.telegram.org (TELEGRAM_API_BASE exists for tests only).
 */
export const telegramToken = () => process.env.TELEGRAM_BOT_TOKEN ?? "";
export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
const apiBase = () => (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");

export type TelegramResult<T = unknown> = { ok: true; result: T } | { ok: false; code: "NOT_CONFIGURED" | "NETWORK" | "TIMEOUT" | "REJECTED" | "BAD_RESPONSE"; status?: number };

export async function telegramCall<T = unknown>(method: string, body: Record<string, unknown> = {}, timeoutMs = 8000): Promise<TelegramResult<T>> {
  const token = telegramToken();
  if (!token) return { ok: false, code: "NOT_CONFIGURED" };
  try {
    const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    let json: { ok?: boolean; result?: T } | null = null;
    try { json = (await res.json()) as { ok?: boolean; result?: T }; } catch { /* not JSON */ }
    if (!res.ok || !json?.ok) return { ok: false, code: json ? "REJECTED" : "BAD_RESPONSE", status: res.status };
    return { ok: true, result: json.result as T };
  } catch (e) {
    return { ok: false, code: e instanceof Error && e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK" };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escapeHtml = esc;

/** Sends one message (HTML parse mode: callers must escape dynamic text with `escapeHtml`). Failures are logged as CODES, never thrown. */
export async function sendTelegram(chatId: string | number, html: string): Promise<boolean> {
  const r = await telegramCall("sendMessage", { chat_id: chatId, text: html.slice(0, 3800), parse_mode: "HTML", disable_web_page_preview: true });
  if (!r.ok) logEvent("warn", "telegram.send_failed", { code: r.code, status: r.status });
  return r.ok;
}
