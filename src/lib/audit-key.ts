import "server-only";
import { getAuthSecret } from "@/lib/auth/secret";
import { deriveChainKey } from "./audit-chain";

let cached: Buffer | undefined;
/** AUDIT_CHAIN_SECRET (>= 32 chars) when set, otherwise derived from AUTH_SECRET. */
export function auditChainKey(): Buffer {
  if (cached) return cached;
  const own = process.env.AUDIT_CHAIN_SECRET;
  return (cached = deriveChainKey(own && own.length >= 32 ? own : getAuthSecret()));
}
