/**
 * One-time Telegram bot setup (run on the server, after creating the bot with @BotFather):
 *   npm run telegram:setup              checks the token, registers the webhook (APP_URL/api/telegram/webhook + secret), sets the bot commands, sends a test message
 *   npm run telegram:setup -- --remove  removes the webhook (e.g. before moving the site)
 * Needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL (+ TELEGRAM_CHAT_ID for the test message). Prints names and results only — never the token.
 * How to find TELEGRAM_CHAT_ID: write /start to your bot (after this command ran once without it) — the bot answers with the chat id.
 */
import { telegramCall, telegramToken } from "../src/services/telegram/client";

const log = (ok: boolean, msg: string) => console.log(`${ok ? "  ok  " : " FAIL "} ${msg}`);
let failed = 0;
const need = (name: string) => { const v = process.env[name]; if (!v) { log(false, `${name} is not set`); failed++; } return v ?? ""; };

async function main() {
  console.log("ACCA USA Telegram setup\n");
  if (!telegramToken()) { log(false, "TELEGRAM_BOT_TOKEN is not set"); process.exit(1); }
  const me = await telegramCall<{ username?: string; first_name?: string }>("getMe");
  if (!me.ok) { log(false, `the token was refused by Telegram (${me.code})`); process.exit(1); }
  log(true, `bot: @${me.result.username ?? "?"}${process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_BOT_USERNAME !== me.result.username ? `  (WARNING: TELEGRAM_BOT_USERNAME says ${process.env.TELEGRAM_BOT_USERNAME})` : ""}`);

  if (process.argv.includes("--remove")) {
    const r = await telegramCall("deleteWebhook");
    log(r.ok, r.ok ? "webhook removed" : `could not remove the webhook (${r.code})`);
    process.exit(r.ok ? 0 : 1);
  }

  const secret = need("TELEGRAM_WEBHOOK_SECRET"); const appUrl = need("APP_URL").replace(/\/$/, "");
  if (failed) process.exit(1);
  if (!appUrl.startsWith("https://")) { log(false, "APP_URL must be https:// (Telegram only calls HTTPS addresses)"); process.exit(1); }
  const url = `${appUrl}/api/telegram/webhook`;
  const hook = await telegramCall("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  log(hook.ok, hook.ok ? `webhook set: ${url}` : `setWebhook failed (${hook.code}${hook.status ? ` ${hook.status}` : ""})`);
  const cmds = await telegramCall("setMyCommands", { commands: [{ command: "start", description: "Start / connect" }, { command: "id", description: "Show this chat id" }, { command: "help", description: "Write to the team" }] });
  log(cmds.ok, cmds.ok ? "bot commands set" : `setMyCommands failed (${cmds.code})`);
  const info = await telegramCall<{ url?: string; last_error_message?: string; pending_update_count?: number }>("getWebhookInfo");
  if (info.ok) log(!info.result.last_error_message, `webhook status: ${info.result.last_error_message ? `Telegram reports an error: ${info.result.last_error_message}` : `registered, ${info.result.pending_update_count ?? 0} pending`}`);

  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!chat) console.log("\nTELEGRAM_CHAT_ID is not set yet: open the bot in Telegram, press Start, copy the number it answers with into /etc/acca-usa/acca-usa.env as TELEGRAM_CHAT_ID, restart the service and run this command again.");
  else {
    const t = await telegramCall("sendMessage", { chat_id: chat, text: "✅ ACCA USA: the bot is connected. Notifications will arrive in this chat." });
    log(t.ok, t.ok ? "test message sent to TELEGRAM_CHAT_ID" : `test message failed (${t.code}) — did you press Start in the bot chat / add the bot to the group?`);
  }
  process.exit(hook.ok && cmds.ok ? 0 : 1);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
