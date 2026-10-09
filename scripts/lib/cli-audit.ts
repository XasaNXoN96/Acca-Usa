import type { PrismaClient } from "@prisma/client";
import { deriveChainKey, type AuditInput } from "../../src/lib/audit-chain";
import { appendAuditEvent } from "../../src/lib/audit-store";

/** Chain key of the operator environment: same rule as the app (AUDIT_CHAIN_SECRET, else AUTH_SECRET; both >= 32 chars). */
export function cliChainKey(): Buffer | null {
  const own = process.env.AUDIT_CHAIN_SECRET;
  const auth = process.env.AUTH_SECRET;
  const secret = own && own.length >= 32 ? own : auth && auth.length >= 32 ? auth : null;
  return secret ? deriveChainKey(secret) : null;
}

/** Writes an operator action to the audit chain. Says so loudly when it cannot — an unrecorded action must never look recorded. */
export async function cliAudit(prisma: PrismaClient, input: Omit<AuditInput, "actor">): Promise<boolean> {
  const key = cliChainKey();
  if (!key) {
    console.error("WARNING: no audit event written — set AUTH_SECRET (or AUDIT_CHAIN_SECRET) in the environment of this command, the same value the application uses.");
    return false;
  }
  try {
    await appendAuditEvent(prisma, key, { ...input, actor: { type: "cli", id: process.env.USER ?? process.env.LOGNAME ?? "operator" } });
    return true;
  } catch (e) {
    console.error(`WARNING: audit event could not be written (${e instanceof Error ? e.message : "error"}).`);
    return false;
  }
}
