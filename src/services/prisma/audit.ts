import "server-only";
import type { Prisma } from "@prisma/client";
import type { AuditService } from "../contracts";
import { GENESIS_HASH, verifyChain } from "@/lib/audit-chain";
import { appendAuditEvent, toAuditRec } from "@/lib/audit-store";
import { auditChainKey } from "@/lib/audit-key";
import { getPrisma } from "@/lib/prisma";

export const auditService: AuditService = {
  async record(input) {
    await appendAuditEvent(getPrisma(), auditChainKey(), input);
  },

  async list(q = {}) {
    const where: Prisma.AuditEventWhereInput = {
      ...(q.action ? { OR: [{ action: q.action }, { action: { startsWith: `${q.action}.` } }] } : {}),
      ...(q.outcome ? { outcome: q.outcome } : {}),
      ...(q.actor ? { actorEmail: { contains: q.actor, mode: "insensitive" } } : {}),
    };
    const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    const [rows, total] = await Promise.all([
      getPrisma().auditEvent.findMany({ where, orderBy: { seq: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      getPrisma().auditEvent.count({ where }),
    ]);
    return { items: rows.map(toAuditRec), total };
  },

  async verify(limit) {
    const prisma = getPrisma();
    const rows = limit
      ? (await prisma.auditEvent.findMany({ orderBy: { seq: "desc" }, take: limit })).reverse()
      : await prisma.auditEvent.findMany({ orderBy: { seq: "asc" } });
    const events = rows.map(toAuditRec);
    // the full chain must start at the genesis hash; a window only proves its own consistency
    return verifyChain(auditChainKey(), events, limit && events.length >= limit ? undefined : GENESIS_HASH);
  },
};
