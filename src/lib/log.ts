import "server-only";

/**
 * Structured server log (one JSON line on stderr). Callers pass an event name and SAFE fields only — never passwords,
 * tokens, session cookies, e-mail bodies or other secrets. There is deliberately no `console.log` in application code.
 */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, string | number | boolean | undefined> = {}) {
  process.stderr.write(`${JSON.stringify({ t: new Date().toISOString(), level, event, ...fields })}\n`);
}
