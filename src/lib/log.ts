import "server-only";

/**
 * Structured server log (one JSON line on stderr). Callers pass an event name and SAFE fields only — never passwords,
 * tokens, session cookies, e-mail bodies or other secrets. There is deliberately no `console.log` in application code.
 */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  process.stderr.write(`${JSON.stringify({ t: new Date().toISOString(), level, event, ...fields })}\n`);
  // Errors (and a few warnings) also go to the team's Telegram chat when it is configured. Lazy import: no cycle, no cost when unused.
  if (process.env.TELEGRAM_BOT_TOKEN && (level === "error" || level === "warn")) {
    void import("@/services/telegram/notify").then((m) => m.notifyFromLog(level, event, fields)).catch(() => undefined);
  }
}
