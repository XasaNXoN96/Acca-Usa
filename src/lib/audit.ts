import "server-only";
import { headers } from "next/headers";
import type { AuditInput } from "./audit-chain";
import { logEvent } from "./log";

/** Client address as reported by the proxy (first X-Forwarded-For hop). Personal data — see docs/AUDIT.md for retention. */
async function clientIp(): Promise<string | undefined> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined)?.slice(0, 45);
  } catch {
    return undefined; // outside a request (webhook workers, scripts)
  }
}

/**
 * Records one audit event. Called AFTER the action succeeded (or was refused), with facts only. A failure to write is logged as a
 * CODE and never turns a completed business action into an error — but it is loud (`audit.write_failed`) and visible to operators.
 */
export async function audit(input: Omit<AuditInput, "ip"> & { ip?: string }): Promise<void> {
  try {
    const { services } = await import("@/services"); // lazy: services/payments records events too (import cycle)
    await services.audit.record({ ...input, ip: input.ip ?? (await clientIp()) });
  } catch (e) {
    logEvent("error", "audit.write_failed", { action: input.action, error: e instanceof Error ? e.name : "unknown" });
  }
}

export const adminActor = (u: { id: string; email: string }): AuditInput["actor"] => ({ type: "admin", id: u.id, email: u.email });
