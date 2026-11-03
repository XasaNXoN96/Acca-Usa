import { timingSafeEqual } from "node:crypto";
import type { PaymentState, ProcessOutcome, ProviderEvent } from "./contracts";

/**
 * Payme Merchant API (JSON-RPC 2.0) — the shop side. Payme CALLS us; we answer from our own records.
 * Methods: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction, GetStatement.
 *
 * Rules that protect the money:
 *  • every request is authenticated with HTTP Basic `Paycom:<key>` (constant-time compare); anything else answers -32504
 *  • the account is OUR payment id; amounts are tiyin and must equal the stored payment exactly (-31001 otherwise)
 *  • access is granted ONLY by PerformTransaction, through the same idempotent state machine as every provider (`apply`)
 *  • Create / Perform / Cancel are idempotent (Payme retries); states: 1 created, 2 performed, -1 cancelled, -2 cancelled after perform (refund)
 *  • a transaction not performed within 12 hours is cancelled (reason 4)
 * Protocol details were written from Payme's public documentation and are verified only against a local test double:
 * the operator MUST run Payme's own sandbox checks before going live (docs/PAYMENTS.md).
 */
export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export type PaymeState = 1 | 2 | -1 | -2;
export interface PaymeTx {
  id: string; paymentId: string; paymeTime: number; amountCents: number; state: PaymeState; reason: number | null;
  createTime: number; performTime: number; cancelTime: number;
}
export interface PaymePayment { id: string; status: PaymentState; amountCents: number; currency: string; provider: string }

export interface PaymeStore {
  findPayment(id: string): Promise<PaymePayment | null>;
  findTx(id: string): Promise<PaymeTx | null>;
  /** a not-yet-finished transaction (state 1) of this payment, if any */
  openTxOf(paymentId: string): Promise<PaymeTx | null>;
  /** returns the stored row; if a concurrent request created the same id first, that existing row is returned instead */
  createTx(tx: PaymeTx): Promise<PaymeTx>;
  /** compare-and-set: true when the row was in `from` and is now `to` */
  transition(id: string, from: PaymeState, to: PaymeState, patch: Partial<Pick<PaymeTx, "performTime" | "cancelTime" | "reason">>): Promise<boolean>;
  listTx(from: number, to: number): Promise<PaymeTx[]>;
}
export interface PaymeDeps {
  store: PaymeStore;
  /** the shared payment state machine (idempotent, checks amount + currency, grants / revokes access) */
  apply(event: ProviderEvent): Promise<ProcessOutcome>;
  key: string;
  now?: () => number;
}

type Msg = { ru: string; uz: string; en: string };
const M = {
  auth: { ru: "Недостаточно привилегий для выполнения метода", uz: "Usulni bajarish uchun vakolat yetarli emas", en: "Insufficient privileges" },
  parse: { ru: "Ошибка разбора запроса", uz: "So‘rovni tahlil qilishda xato", en: "Parse error" },
  invalid: { ru: "Неверный запрос", uz: "Noto‘g‘ri so‘rov", en: "Invalid request" },
  method: { ru: "Метод не найден", uz: "Usul topilmadi", en: "Method not found" },
  amount: { ru: "Неверная сумма", uz: "Noto‘g‘ri summa", en: "Wrong amount" },
  noOrder: { ru: "Заказ не найден", uz: "Buyurtma topilmadi", en: "Order not found" },
  notPayable: { ru: "Заказ нельзя оплатить", uz: "Buyurtmani to‘lab bo‘lmaydi", en: "The order cannot be paid" },
  busy: { ru: "По заказу уже есть другая транзакция", uz: "Buyurtma bo‘yicha boshqa tranzaksiya mavjud", en: "Another transaction is in progress for this order" },
  noTx: { ru: "Транзакция не найдена", uz: "Tranzaksiya topilmadi", en: "Transaction not found" },
  cannot: { ru: "Невозможно выполнить операцию", uz: "Amalni bajarib bo‘lmaydi", en: "Unable to perform this operation" },
} satisfies Record<string, Msg>;

class RpcError extends Error {
  constructor(readonly code: number, readonly msg: Msg, readonly data?: string) { super(String(code)); }
}

export const paymeAuthOk = (header: string | null, key: string): boolean => {
  if (!header?.startsWith("Basic ") || !key) return false;
  const given = Buffer.from(header.slice(6).trim(), "base64");
  const expected = Buffer.from(`Paycom:${key}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function handlePayme(req: { authorization: string | null; body: string }, deps: PaymeDeps): Promise<{ body: unknown }> {
  const now = deps.now ?? Date.now;
  let id: unknown = null;
  const fail = (e: RpcError) => ({ body: { jsonrpc: "2.0", id, error: { code: e.code, message: e.msg, ...(e.data ? { data: e.data } : {}) } } });
  let parsed: unknown;
  try { parsed = JSON.parse(req.body); } catch { return fail(new RpcError(-32700, M.parse)); }
  if (!isObj(parsed) || typeof parsed.method !== "string") return fail(new RpcError(-32600, M.invalid));
  id = parsed.id ?? null;
  if (!paymeAuthOk(req.authorization, deps.key)) return fail(new RpcError(-32504, M.auth));
  const params = isObj(parsed.params) ? parsed.params : {};

  try {
    const result = await dispatch(parsed.method, params, deps, now());
    return { body: { jsonrpc: "2.0", id, result } };
  } catch (e) {
    if (e instanceof RpcError) return fail(e);
    throw e; // a real failure (database down): the route answers 500 and Payme retries
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null);
const orderOf = (account: unknown): string => {
  const o = isObj(account) ? str(account.order_id) : null;
  if (!o) throw new RpcError(-31050, M.noOrder, "order_id");
  return o;
};

/** Validates account + amount of an order that is about to be paid. */
async function checkOrder(deps: PaymeDeps, params: Record<string, unknown>): Promise<PaymePayment> {
  const orderId = orderOf(params.account);
  const amount = num(params.amount);
  if (amount === null || amount <= 0) throw new RpcError(-31001, M.amount);
  const payment = await deps.store.findPayment(orderId);
  if (!payment || payment.provider !== "payme") throw new RpcError(-31050, M.noOrder, "order_id");
  if (payment.status !== "PENDING") throw new RpcError(-31051, M.notPayable, "order_id");
  if (payment.currency.toUpperCase() !== "UZS" || amount !== payment.amountCents) throw new RpcError(-31001, M.amount);
  return payment;
}

const view = (t: PaymeTx) => ({ create_time: t.createTime, perform_time: t.performTime, cancel_time: t.cancelTime, transaction: t.paymentId, state: t.state, reason: t.reason });

async function dispatch(method: string, p: Record<string, unknown>, deps: PaymeDeps, now: number): Promise<unknown> {
  const { store } = deps;
  const txId = str(p.id);
  const expire = async (t: PaymeTx) => { // a transaction nobody finished within 12 hours
    if (await store.transition(t.id, 1, -1, { cancelTime: now, reason: 4 })) await deps.apply({ eventId: `cancel:${t.id}`, type: "cancelled", paymentId: t.paymentId, providerPaymentId: t.id });
  };

  switch (method) {
    case "CheckPerformTransaction": {
      await checkOrder(deps, p);
      return { allow: true };
    }
    case "CreateTransaction": {
      const time = num(p.time);
      if (!txId || time === null) throw new RpcError(-32600, M.invalid);
      const existing = await store.findTx(txId);
      if (existing) {
        if (existing.state !== 1) throw new RpcError(-31008, M.cannot);
        if (now - existing.createTime > PAYME_TIMEOUT_MS) { await expire(existing); throw new RpcError(-31008, M.cannot); }
        return { create_time: existing.createTime, transaction: existing.paymentId, state: 1 };
      }
      const payment = await checkOrder(deps, p);
      const open = await store.openTxOf(payment.id);
      if (open && now - open.createTime <= PAYME_TIMEOUT_MS) throw new RpcError(-31099, M.busy, "order_id");
      if (open) await expire(open);
      const created = await store.createTx({ id: txId, paymentId: payment.id, paymeTime: time, amountCents: payment.amountCents, state: 1, reason: null, createTime: now, performTime: 0, cancelTime: 0 });
      return { create_time: created.createTime, transaction: created.paymentId, state: created.state };
    }
    case "PerformTransaction": {
      if (!txId) throw new RpcError(-32600, M.invalid);
      const t = await store.findTx(txId);
      if (!t) throw new RpcError(-31003, M.noTx);
      if (t.state === 2) return { transaction: t.paymentId, perform_time: t.performTime, state: 2 };
      if (t.state !== 1) throw new RpcError(-31008, M.cannot);
      if (now - t.createTime > PAYME_TIMEOUT_MS) { await expire(t); throw new RpcError(-31008, M.cannot); }
      const payment = await store.findPayment(t.paymentId);
      if (!payment) throw new RpcError(-31008, M.cannot);
      // Access is granted here and nowhere else; the state machine re-checks provider, amount and currency against the stored payment.
      const outcome = await deps.apply({ eventId: `perform:${t.id}`, type: "paid", paymentId: t.paymentId, providerPaymentId: t.id, amountCents: t.amountCents, currency: payment.currency });
      if (outcome === "ignored") throw new RpcError(-31008, M.cannot);
      await store.transition(t.id, 1, 2, { performTime: now });
      const done = (await store.findTx(t.id))!;
      return { transaction: done.paymentId, perform_time: done.performTime, state: done.state };
    }
    case "CancelTransaction": {
      if (!txId) throw new RpcError(-32600, M.invalid);
      const reason = num(p.reason);
      const t = await store.findTx(txId);
      if (!t) throw new RpcError(-31003, M.noTx);
      if (t.state === -1 || t.state === -2) return { transaction: t.paymentId, cancel_time: t.cancelTime, state: t.state };
      if (t.state === 1) {
        await store.transition(t.id, 1, -1, { cancelTime: now, reason });
        await deps.apply({ eventId: `cancel:${t.id}`, type: "cancelled", paymentId: t.paymentId, providerPaymentId: t.id });
      } else {
        // performed → refund: the shared state machine withdraws the access this payment granted
        const outcome = await deps.apply({ eventId: `refund:${t.id}`, type: "refunded", paymentId: t.paymentId, providerPaymentId: t.id });
        if (outcome === "ignored") throw new RpcError(-31007, M.cannot);
        await store.transition(t.id, 2, -2, { cancelTime: now, reason });
      }
      const done = (await store.findTx(t.id))!;
      return { transaction: done.paymentId, cancel_time: done.cancelTime, state: done.state };
    }
    case "CheckTransaction": {
      if (!txId) throw new RpcError(-32600, M.invalid);
      const t = await store.findTx(txId);
      if (!t) throw new RpcError(-31003, M.noTx);
      return view(t);
    }
    case "GetStatement": {
      const from = num(p.from), to = num(p.to);
      if (from === null || to === null || to < from) throw new RpcError(-32600, M.invalid);
      const list = await store.listTx(from, to);
      return { transactions: list.map((t) => ({ id: t.id, time: t.paymeTime, amount: t.amountCents, account: { order_id: t.paymentId }, ...view(t) })) };
    }
    default:
      throw new RpcError(-32601, M.method);
  }
}
