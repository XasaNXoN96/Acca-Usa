import { createHmac, hkdfSync } from "node:crypto";

/**
 * Tamper-evident audit chain (pure functions; no framework imports so operator scripts can use them too).
 * Every event carries `prevHash` (the hash of the event before it) and `hash` = HMAC-SHA-256(key, canonical event incl. prevHash).
 * Editing, deleting or re-ordering any row breaks the chain from that row on; without the key the chain cannot be recomputed.
 */
export type AuditOutcome = "success" | "denied" | "failed";
export type AuditActorType = "admin" | "system" | "cli";

export interface AuditInput {
  actor: { type: AuditActorType; id?: string; email?: string };
  /** dot-separated code, e.g. `materials.update`, `auth.login`, `payment.refunded` */
  action: string;
  target?: { type: string; id?: string };
  outcome?: AuditOutcome;
  /** SAFE facts only (field NAMES, status transitions, counts) — secrets are redacted defensively, never rely on that */
  meta?: Record<string, unknown>;
  ip?: string;
}

export interface AuditEventRec {
  id: string;
  seq: number;
  at: string;
  actorType: AuditActorType;
  actorId?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  outcome: AuditOutcome;
  metaJson?: string;
  ip?: string;
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = "0".repeat(64);

/** Derives the chain key; AUDIT_CHAIN_SECRET (optional) lets AUTH_SECRET rotate without invalidating old events. */
export function deriveChainKey(secret: Buffer | string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.alloc(0), "acca-usa:audit-chain:v1", 32));
}

const SENSITIVE = /pass|secret|token|code|hash|key|auth|cookie|card|cvv|signature|otp/i;
const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

function clean(v: unknown, depth: number): unknown {
  if (v === null || typeof v === "boolean" || typeof v === "number") return Number.isFinite(v as number) || typeof v !== "number" ? v : null;
  if (typeof v === "string") return clip(v);
  if (Array.isArray(v)) return depth > 1 ? "[…]" : v.slice(0, 20).map((x) => clean(x, depth + 1));
  if (typeof v === "object" && v) {
    if (depth > 1) return "{…}";
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = SENSITIVE.test(k) ? "[redacted]" : clean((v as Record<string, unknown>)[k], depth + 1);
    return out;
  }
  return undefined;
}

/** Canonical (sorted-key) JSON of the redacted metadata, or undefined when empty. Bounded in size. */
export function canonicalMeta(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  const json = JSON.stringify(clean(meta, 0));
  if (!json || json === "{}") return undefined;
  return json.length > 2000 ? JSON.stringify({ truncated: true }) : json;
}

export type HashableEvent = Omit<AuditEventRec, "seq" | "hash">;

export function computeHash(key: Buffer, e: HashableEvent): string {
  const payload = JSON.stringify([
    e.prevHash, e.id, e.at, e.actorType, e.actorId ?? null, e.actorEmail ?? null, e.action,
    e.targetType ?? null, e.targetId ?? null, e.outcome, e.metaJson ?? null, e.ip ?? null,
  ]);
  return createHmac("sha256", key).update(payload).digest("hex");
}

export type AuditVerification =
  | { ok: true; checked: number; head: string }
  | { ok: false; checked: number; badId: string; reason: "HASH" | "LINK" };

/** `events` in insertion order. With `startPrev` the first event must link to it (omit to verify a window without its predecessor). */
export function verifyChain(key: Buffer, events: readonly AuditEventRec[], startPrev?: string): AuditVerification {
  let prev = startPrev;
  let checked = 0;
  for (const e of events) {
    if (prev !== undefined && e.prevHash !== prev) return { ok: false, checked, badId: e.id, reason: "LINK" };
    const { seq: _seq, hash, ...rest } = e;
    void _seq;
    if (computeHash(key, rest) !== hash) return { ok: false, checked, badId: e.id, reason: "HASH" };
    prev = hash;
    checked++;
  }
  return { ok: true, checked, head: prev ?? GENESIS_HASH };
}
