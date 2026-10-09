import "server-only";

/**
 * Process-local delivery counters of THIS server instance (they reset on restart and are not shared between instances).
 * Real outcomes only: "sent" means the SMTP server ACCEPTED the message — inbox delivery cannot be known from here.
 */
interface Stats { sent: number; failed: number; lastOkAt?: string; lastFailAt?: string; lastFailCode?: string }
const g = globalThis as unknown as { __accaEmailStats?: Stats };
const stats = () => (g.__accaEmailStats ??= { sent: 0, failed: 0 });

export function recordEmailOutcome(ok: boolean, code?: string) {
  const s = stats();
  if (ok) { s.sent += 1; s.lastOkAt = new Date().toISOString(); } else { s.failed += 1; s.lastFailAt = new Date().toISOString(); s.lastFailCode = code ?? "UNKNOWN"; }
}
export const emailStats = (): Readonly<Stats> => ({ ...stats() });
export const resetEmailStats = () => { g.__accaEmailStats = { sent: 0, failed: 0 }; };
