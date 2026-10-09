import "server-only";
import { randomUUID } from "node:crypto";
import type { AuditService } from "../contracts";
import { canonicalMeta, computeHash, GENESIS_HASH, verifyChain, type AuditEventRec } from "@/lib/audit-chain";
import { auditChainKey } from "@/lib/audit-key";
import { getDb } from "./db";

let seq = 0;
export const auditService: AuditService = {
  async record(input) {
    const db = getDb();
    const base = {
      id: randomUUID(), at: new Date().toISOString(), actorType: input.actor.type, actorId: input.actor.id, actorEmail: input.actor.email?.slice(0, 254),
      action: input.action.slice(0, 80), targetType: input.target?.type.slice(0, 40), targetId: input.target?.id?.slice(0, 80),
      outcome: input.outcome ?? "success", metaJson: canonicalMeta(input.meta), ip: input.ip?.slice(0, 45),
      prevHash: db.audit.at(-1)?.hash ?? GENESIS_HASH,
    };
    // frozen: nothing in the process can edit a written event (the service has no update / delete either)
    db.audit.push(Object.freeze({ ...base, seq: ++seq, hash: computeHash(auditChainKey(), base) }) as AuditEventRec);
  },

  async list(q = {}) {
    const all = getDb().audit.filter((e) =>
      (!q.action || e.action === q.action || e.action.startsWith(`${q.action}.`)) && (!q.outcome || e.outcome === q.outcome) &&
      (!q.actor || (e.actorEmail ?? "").toLowerCase().includes(q.actor.toLowerCase())));
    const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    const newest = [...all].reverse();
    return { items: newest.slice((page - 1) * pageSize, page * pageSize), total: all.length };
  },

  async verify(limit) {
    const all = getDb().audit;
    const window = limit ? all.slice(-limit) : all;
    const start = window.length && window.length === all.length ? GENESIS_HASH : undefined;
    return verifyChain(auditChainKey(), window, start);
  },
};
