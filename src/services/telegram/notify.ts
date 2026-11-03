import "server-only";
import { escapeHtml, sendTelegram, telegramConfigured } from "./client";

/**
 * Operator notifications to the team's Telegram chat (TELEGRAM_CHAT_ID): everything that happens in the system, by category.
 *   system    server start, unexpected errors, outages (e-mail, storage, database, payments)
 *   security  sign-ins and second-factor events, administrator actions, access grants
 *   users     new sign-ups
 *   payments  paid / failed / cancelled / refunded
 *   content   uploads, virus findings, processing problems, content edits
 *   support   messages from the support form and direct messages to the bot
 * TELEGRAM_EVENTS=system,security,… limits the categories (default: all). Fire and forget: a Telegram outage never breaks a request.
 * Floods are bounded: identical events inside 10 minutes are merged into "×N", and at most 20 messages per minute are sent
 * (the rest are summarised in one line). Never put secrets, passwords, codes, tokens or message bodies of students in an event.
 */
export type Category = "system" | "security" | "users" | "payments" | "content" | "support";
const ALL: Category[] = ["system", "security", "users", "payments", "content", "support"];
const EMOJI: Record<Category, string> = { system: "⚙️", security: "🔐", users: "👤", payments: "💰", content: "📚", support: "💬" };

export const telegramCategories = (): Category[] => {
  const v = process.env.TELEGRAM_EVENTS?.split(",").map((x) => x.trim()).filter(Boolean);
  return v?.length ? (v.filter((x) => (ALL as string[]).includes(x)) as Category[]) : ALL;
};
export const telegramEnabledFor = (c: Category) => telegramConfigured() && telegramCategories().includes(c);

/** "masked" (default): j***@gmail.com — personal data leaves the server only in a reduced form. "full": the whole address (TELEGRAM_PII=full). */
export const maskEmail = (email: string): string => {
  if (process.env.TELEGRAM_PII === "full") return email;
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
};

const DEDUPE_MS = 10 * 60_000;
const MAX_PER_MINUTE = 20;
const seen = new Map<string, { at: number; count: number }>();
let windowStart = Date.now();
let sentInWindow = 0;
let suppressed = 0;

/** Resets the in-memory flood state (tests). */
export function resetNotifyState() { seen.clear(); windowStart = Date.now(); sentInWindow = 0; suppressed = 0; }

export function notifyOps(category: Category, title: string, linesIn: string[] = [], key?: string): void {
  let lines = linesIn;
  if (!telegramEnabledFor(category)) return;
  const now = Date.now();
  const k = `${category}|${key ?? title}`;
  const prev = seen.get(k);
  if (prev && now - prev.at < DEDUPE_MS) { prev.count++; return; } // merged: the first one was already sent
  if (seen.size > 500) for (const [kk, v] of seen) if (now - v.at >= DEDUPE_MS) seen.delete(kk);
  const merged = prev && prev.count > 1 ? prev.count - 1 : 0;
  seen.set(k, { at: now, count: 1 });
  if (merged) lines = [...lines, `(+${merged} similar event(s) since the previous message)`];

  if (now - windowStart >= 60_000) {
    windowStart = now; sentInWindow = 0;
    if (suppressed > 0) { const n = suppressed; suppressed = 0; void send(`⚠️ <b>Event flood</b>\n${n} event(s) were not sent in the last minute to avoid a flood.`); }
  }
  if (sentInWindow >= MAX_PER_MINUTE) { suppressed++; return; }
  sentInWindow++;
  const host = (process.env.APP_URL ?? "").replace(/^https?:\/\//, "") || "server";
  void send(`${EMOJI[category]} <b>${escapeHtml(title)}</b>${lines.length ? "\n" + lines.map(escapeHtml).join("\n") : ""}\n<i>${escapeHtml(host)} · ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</i>`);
}

async function send(html: string): Promise<void> {
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) return;
  try { await sendTelegram(chat, html); } catch { /* sendTelegram never throws; belt and braces */ }
}

/** Log events that deserve a message although they are not errors. */
const WORTHY_WARNINGS = new Set(["upload.virus_found", "payment.amount_mismatch", "payment.webhook_rejected", "auth.rate_limited", "email.not_sent"]);

/** Called by logEvent: every error-level event (and a few warnings) reaches the team. Messages carry the event name and SAFE fields only. */
export function notifyFromLog(level: string, event: string, fields: Record<string, string | number | boolean | undefined>): void {
  if (event.startsWith("telegram.")) return; // never report the reporter
  if (level !== "error" && !(level === "warn" && WORTHY_WARNINGS.has(event))) return;
  const category: Category = event.startsWith("payment.") ? "payments" : event.startsWith("upload.") || event.startsWith("media.") ? "content" : "system";
  const lines = Object.entries(fields).filter(([, v]) => v !== undefined).slice(0, 8).map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`);
  notifyOps(category, `${level === "error" ? "Error" : "Warning"}: ${event}`, lines, `${event}|${fields.code ?? fields.error ?? fields.reason ?? ""}`);
}

/** Audit events (administrator actions, sign-ins, second factor, access, backups…) → security or content messages. Facts only, no values. */
export function notifyAudit(a: { actor: { type: string; id?: string; email?: string }; action: string; target?: { type: string; id?: string }; outcome?: string }): void {
  if (a.action.startsWith("payment.")) return; // payments have their own message with the amount (services/payments/process.ts)
  const security = /^(auth|mfa|admin|backup|access|students|settings|certificates)\b|^(auth|mfa|admin|backup)\./.test(a.action);
  const who = a.actor.email ? maskEmail(a.actor.email) : a.actor.type;
  const lines = [`by: ${who}`, ...(a.target ? [`target: ${a.target.type}${a.target.id ? ` ${a.target.id.slice(0, 24)}` : ""}`] : []), ...(a.outcome && a.outcome !== "success" ? [`outcome: ${a.outcome}`] : [])];
  const failed = a.outcome === "failed" || a.outcome === "denied";
  notifyOps(security ? "security" : "content", `${failed ? "⚠️ " : ""}${a.action}`, lines, `${a.action}|${a.actor.id ?? who}|${a.outcome ?? ""}`);
}
