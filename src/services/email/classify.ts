/**
 * Maps an SMTP / transport error to a SAFE code. Only the code is ever logged or shown — never the error message, which
 * may contain the server's banner, the recipient or (with some servers) fragments of credentials.
 */
export type EmailFailure = "AUTH" | "CONNECTION" | "TIMEOUT" | "TEMPORARY" | "REJECTED_RECIPIENT" | "REJECTED_MESSAGE" | "UNKNOWN";

export function classifySmtpError(e: unknown): { code: EmailFailure; transient: boolean } {
  const err = (e ?? {}) as { code?: string; responseCode?: number };
  const c = String(err.code ?? "").toUpperCase();
  const rc = Number(err.responseCode ?? 0);
  if (c === "EAUTH" || rc === 535 || rc === 534 || rc === 530) return { code: "AUTH", transient: false };
  if (c === "ETIMEDOUT" || c === "ESOCKETTIMEDOUT" || c === "ECONNRESET") return { code: "TIMEOUT", transient: true };
  if (["ECONNECTION", "ECONNREFUSED", "ESOCKET", "ENOTFOUND", "EDNS", "EHOSTUNREACH", "ENETUNREACH"].includes(c)) return { code: "CONNECTION", transient: true };
  if (rc >= 400 && rc < 500) return { code: "TEMPORARY", transient: true };
  if (c === "EENVELOPE" || rc === 550 || rc === 551 || rc === 553 || rc === 501) return { code: "REJECTED_RECIPIENT", transient: false };
  if (rc >= 500 || c === "EMESSAGE") return { code: "REJECTED_MESSAGE", transient: false };
  return { code: "UNKNOWN", transient: false };
}
