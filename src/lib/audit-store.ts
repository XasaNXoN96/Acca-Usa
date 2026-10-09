import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { canonicalMeta, computeHash, GENESIS_HASH, type AuditActorType, type AuditEventRec, type AuditInput, type AuditOutcome } from "./audit-chain";

/** Arbitrary constant: serialises chain appends across every app instance and operator script (transaction-scoped lock). */
const CHAIN_LOCK = 7_240_017;

export const toAuditRec = (r: {
  id: string; seq: number; at: Date; actorType: string; actorId: string | null; actorEmail: string | null; action: string;
  targetType: string | null; targetId: string | null; outcome: string; metaJson: string | null; ip: string | null; prevHash: string; hash: string;
}): AuditEventRec => ({
  id: r.id, seq: r.seq, at: r.at.toISOString(), actorType: r.actorType as AuditActorType, actorId: r.actorId ?? undefined, actorEmail: r.actorEmail ?? undefined,
  action: r.action, targetType: r.targetType ?? undefined, targetId: r.targetId ?? undefined, outcome: r.outcome as AuditOutcome,
  metaJson: r.metaJson ?? undefined, ip: r.ip ?? undefined, prevHash: r.prevHash, hash: r.hash,
});

/** Appends one event to the PostgreSQL chain. Shared by the application service and the operator CLIs. */
export async function appendAuditEvent(prisma: PrismaClient, key: Buffer, input: AuditInput): Promise<AuditEventRec> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK})`;
    const last = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
    const base = {
      id: randomUUID(),
      at: new Date().toISOString(), // millisecond precision == the TIMESTAMP(3) column, so the stored value re-hashes identically
      actorType: input.actor.type, actorId: input.actor.id, actorEmail: input.actor.email?.slice(0, 254),
      action: input.action.slice(0, 80), targetType: input.target?.type.slice(0, 40), targetId: input.target?.id?.slice(0, 80),
      outcome: input.outcome ?? "success", metaJson: canonicalMeta(input.meta), ip: input.ip?.slice(0, 45),
      prevHash: last?.hash ?? GENESIS_HASH,
    };
    const hash = computeHash(key, base);
    const row = await tx.auditEvent.create({
      data: {
        id: base.id, at: new Date(base.at), actorType: base.actorType, actorId: base.actorId ?? null, actorEmail: base.actorEmail ?? null, action: base.action,
        targetType: base.targetType ?? null, targetId: base.targetId ?? null, outcome: base.outcome, metaJson: base.metaJson ?? null, ip: base.ip ?? null,
        prevHash: base.prevHash, hash,
      },
    });
    return toAuditRec(row);
  });
}
