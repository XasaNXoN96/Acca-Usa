import "server-only";
import type { PaymeState, PaymeStore, PaymeTx } from "../payments/payme-rpc";
import { getPrisma } from "@/lib/prisma";

type Row = { id: string; paymentId: string; paymeTime: bigint; amountCents: number; state: number; reason: number | null; createTime: bigint; performTime: bigint; cancelTime: bigint };
const toTx = (r: Row): PaymeTx => ({ id: r.id, paymentId: r.paymentId, paymeTime: Number(r.paymeTime), amountCents: r.amountCents, state: r.state as PaymeState, reason: r.reason, createTime: Number(r.createTime), performTime: Number(r.performTime), cancelTime: Number(r.cancelTime) });

/** PostgreSQL persistence of Payme transactions (table PaymeTransaction). */
export const paymeStore: PaymeStore = {
  async findPayment(id) {
    const p = await getPrisma().payment.findUnique({ where: { id } });
    return p ? { id: p.id, status: p.status, amountCents: p.amountCents, currency: p.currency, provider: p.provider } : null;
  },
  async findTx(id) {
    const r = await getPrisma().paymeTransaction.findUnique({ where: { id } });
    return r ? toTx(r) : null;
  },
  async openTxOf(paymentId) {
    const r = await getPrisma().paymeTransaction.findFirst({ where: { paymentId, state: 1 }, orderBy: { createTime: "desc" } });
    return r ? toTx(r) : null;
  },
  async createTx(tx) {
    const prisma = getPrisma();
    try {
      const r = await prisma.paymeTransaction.create({ data: { id: tx.id, paymentId: tx.paymentId, paymeTime: BigInt(tx.paymeTime), amountCents: tx.amountCents, state: tx.state, reason: tx.reason, createTime: BigInt(tx.createTime), performTime: BigInt(tx.performTime), cancelTime: BigInt(tx.cancelTime) } });
      return toTx(r);
    } catch (e) {
      // the same transaction id arrived twice at once: the first one wins, the second gets its row back (idempotent Create)
      if ((e as { code?: string }).code === "P2002") { const r = await prisma.paymeTransaction.findUnique({ where: { id: tx.id } }); if (r) return toTx(r); }
      throw e;
    }
  },
  async transition(id, from, to, patch) {
    const res = await getPrisma().paymeTransaction.updateMany({
      where: { id, state: from },
      data: { state: to, ...(patch.performTime !== undefined ? { performTime: BigInt(patch.performTime) } : {}), ...(patch.cancelTime !== undefined ? { cancelTime: BigInt(patch.cancelTime) } : {}), ...(patch.reason !== undefined ? { reason: patch.reason } : {}) },
    });
    return res.count === 1;
  },
  async listTx(from, to) {
    const rows = await getPrisma().paymeTransaction.findMany({ where: { paymeTime: { gte: BigInt(from), lte: BigInt(to) } }, orderBy: { paymeTime: "asc" }, take: 5000 });
    return rows.map(toTx);
  },
};
