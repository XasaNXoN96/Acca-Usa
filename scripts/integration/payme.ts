/**
 * Payme Merchant API (JSON-RPC) against in-memory stores and the REAL payment state machine. No network, no Payme account:
 * this proves OUR side of the protocol (auth, amounts, idempotency, states, timeout, refund, access only on Perform).
 * It does NOT prove that Payme accepts the answers — run Payme's own sandbox checks (docs/PAYMENTS.md).
 *   npm run test:payme
 */
import assert from "node:assert/strict";
import { applyProviderEvent } from "../../src/services/payments/process";
import { PAYME_TIMEOUT_MS, handlePayme, paymeAuthOk, type PaymeDeps, type PaymeStore, type PaymeTx } from "../../src/services/payments/payme-rpc";
import { PaymePaymentProvider } from "../../src/services/payments/payme-provider";
import type { PaymentRec, PaymentStore } from "../../src/services/payments/contracts";

const KEY = "test-cashbox-key-0123456789";
const AUTH = `Basic ${Buffer.from(`Paycom:${KEY}`).toString("base64")}`;
let clock = 1_800_000_000_000;

function world(payments: PaymentRec[]) {
  const pay = new Map(payments.map((p) => [p.id, { ...p }]));
  const events = new Set<string>();
  const access = new Map<string, string>();
  const notes: string[] = [];
  const paymentStore: PaymentStore = {
    async findById(id) { return pay.get(id) ?? null; },
    async findByProviderRef(provider, ref) { return [...pay.values()].find((p) => p.provider === provider && p.providerPaymentId === ref) ?? null; },
    async recordEvent(provider, eventId) { const k = `${provider}:${eventId}`; if (events.has(k)) return false; events.add(k); return true; },
    async forgetEvent(provider, eventId) { events.delete(`${provider}:${eventId}`); },
    async update(id, patch) { Object.assign(pay.get(id)!, patch); },
    async grantAccess(userId, platform) { access.set(`${userId}:${platform}`, "ACTIVE"); },
    async revokeAccess(userId, platform) { access.set(`${userId}:${platform}`, "REVOKED"); },
    async userContact() { return null; },
  };
  const txs = new Map<string, PaymeTx>();
  const store: PaymeStore = {
    async findPayment(id) { const p = pay.get(id); return p ? { id: p.id, status: p.status, amountCents: p.amountCents, currency: p.currency, provider: p.provider } : null; },
    async findTx(id) { const t = txs.get(id); return t ? { ...t } : null; },
    async openTxOf(paymentId) { const t = [...txs.values()].find((x) => x.paymentId === paymentId && x.state === 1); return t ? { ...t } : null; },
    async createTx(tx) { const e = txs.get(tx.id); if (e) return { ...e }; txs.set(tx.id, { ...tx }); return { ...tx }; },
    async transition(id, from, to, patch) { const t = txs.get(id); if (!t || t.state !== from) return false; Object.assign(t, patch, { state: to }); return true; },
    async listTx(from, to) { return [...txs.values()].filter((t) => t.paymeTime >= from && t.paymeTime <= to).map((t) => ({ ...t })); },
  };
  const deps: PaymeDeps = {
    store, key: KEY, now: () => clock,
    apply: (event) => applyProviderEvent(paymentStore, "payme", event, { async paymentReceived() { notes.push("received"); }, async paymentFailed() { notes.push("failed"); } }),
  };
  const call = async (method: string, params: Record<string, unknown>, auth: string | null = AUTH, id: unknown = 1) =>
    (await handlePayme({ authorization: auth, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }, deps)).body as { id: unknown; result?: Record<string, unknown>; error?: { code: number; data?: string; message: { en: string } } };
  return { pay, access, notes, txs, call, deps };
}
const order = (over: Partial<PaymentRec> = {}): PaymentRec => ({
  id: "pay-1", userId: "u1", platform: "acca", description: "ACCA — full access", amountCents: 15_000_000, currency: "UZS", status: "PENDING",
  provider: "payme", providerPaymentId: "payme:pay-1", createdAt: new Date().toISOString(), ...over,
});
const acct = (id = "pay-1") => ({ order_id: id });

async function main() {
  // ── authentication, framing
  let w = world([order()]);
  assert.ok(paymeAuthOk(AUTH, KEY)); assert.ok(!paymeAuthOk(null, KEY)); assert.ok(!paymeAuthOk("Basic abc", KEY)); assert.ok(!paymeAuthOk(`Basic ${Buffer.from("Paycom:wrong").toString("base64")}`, KEY)); assert.ok(!paymeAuthOk(AUTH, ""));
  assert.equal((await w.call("CheckPerformTransaction", { amount: 15_000_000, account: acct() }, null)).error?.code, -32504, "no credentials");
  assert.equal((await w.call("CheckPerformTransaction", { amount: 15_000_000, account: acct() }, `Basic ${Buffer.from("Paycom:nope").toString("base64")}`)).error?.code, -32504, "wrong key");
  assert.equal((await w.call("Nope", {})).error?.code, -32601);
  assert.equal(((await handlePayme({ authorization: AUTH, body: "{not json" }, w.deps)).body as { error: { code: number } }).error.code, -32700);
  assert.equal((await w.call("CheckTransaction", { id: "x" }, AUTH, "abc")).id, "abc", "the request id is echoed");
  assert.equal(w.access.size, 0);

  // ── CheckPerformTransaction
  assert.deepEqual((await w.call("CheckPerformTransaction", { amount: 15_000_000, account: acct() })).result, { allow: true });
  assert.deepEqual([(await w.call("CheckPerformTransaction", { amount: 15_000_000, account: acct("nope") })).error?.code, (await w.call("CheckPerformTransaction", { amount: 15_000_000, account: acct("nope") })).error?.data], [-31050, "order_id"]);
  assert.equal((await w.call("CheckPerformTransaction", { amount: 14_999_999, account: acct() })).error?.code, -31001, "wrong amount");
  assert.equal((await w.call("CheckPerformTransaction", { amount: 15_000_000, account: {} })).error?.code, -31050, "no account");
  assert.equal((await w.call("CheckPerformTransaction", { amount: 15_000_000.5, account: acct() })).error?.code, -31001, "non-integer amount");
  const other = world([order({ provider: "stripe" })]); assert.equal((await other.call("CheckPerformTransaction", { amount: 15_000_000, account: acct() })).error?.code, -31050, "a payment of another provider is not payable here");
  const usd = world([order({ currency: "USD" })]); assert.equal((await usd.call("CheckPerformTransaction", { amount: 15_000_000, account: acct() })).error?.code, -31001, "a non-sum payment is refused");

  // ── CreateTransaction: idempotent, one open transaction per order, never grants access
  const c1 = await w.call("CreateTransaction", { id: "tx-1", time: clock, amount: 15_000_000, account: acct() });
  assert.deepEqual([c1.result?.state, c1.result?.transaction, c1.result?.create_time], [1, "pay-1", clock]);
  clock += 5_000;
  assert.deepEqual((await w.call("CreateTransaction", { id: "tx-1", time: clock, amount: 15_000_000, account: acct() })).result, { create_time: c1.result?.create_time, transaction: "pay-1", state: 1 }, "same id → same answer");
  assert.equal((await w.call("CreateTransaction", { id: "tx-2", time: clock, amount: 15_000_000, account: acct() })).error?.code, -31099, "another transaction for the same order while one is open");
  assert.equal((await w.call("CreateTransaction", { id: "tx-3", time: clock, amount: 1, account: acct() })).error?.code, -31001);
  assert.equal(w.access.size, 0, "Create / Check never grant access");
  assert.equal(w.pay.get("pay-1")!.status, "PENDING");
  assert.equal((await w.call("CheckTransaction", { id: "tx-1" })).result?.state, 1);
  assert.equal((await w.call("CheckTransaction", { id: "zzz" })).error?.code, -31003);

  // ── PerformTransaction: the ONLY place access is granted; idempotent; parallel deliveries apply once
  const results = await Promise.all(Array.from({ length: 6 }, () => w.call("PerformTransaction", { id: "tx-1" })));
  assert.ok(results.every((r) => r.result?.state === 2 && r.result?.perform_time === results[0]!.result?.perform_time), JSON.stringify(results.map((r) => r.result ?? r.error)));
  assert.equal(w.pay.get("pay-1")!.status, "PAID"); assert.equal(w.access.get("u1:acca"), "ACTIVE"); assert.deepEqual(w.notes, ["received"], "one notification");
  assert.equal((await w.call("PerformTransaction", { id: "tx-1" })).result?.state, 2, "repeat → same");
  assert.equal((await w.call("CheckPerformTransaction", { amount: 15_000_000, account: acct() })).error?.code, -31051, "a paid order cannot be paid again");
  assert.equal((await w.call("PerformTransaction", { id: "none" })).error?.code, -31003);
  assert.equal((await w.call("CancelTransaction", { id: "none", reason: 1 })).error?.code, -31003);

  // ── refund: cancel after perform withdraws access; repeat is idempotent
  clock += 1000;
  const refund = await w.call("CancelTransaction", { id: "tx-1", reason: 5 });
  assert.deepEqual([refund.result?.state, w.pay.get("pay-1")!.status, w.access.get("u1:acca")], [-2, "REFUNDED", "REVOKED"]);
  assert.equal((await w.call("CancelTransaction", { id: "tx-1", reason: 5 })).result?.cancel_time, refund.result?.cancel_time);
  assert.equal((await w.call("PerformTransaction", { id: "tx-1" })).error?.code, -31008, "a cancelled transaction cannot be performed");
  assert.equal((await w.call("CheckTransaction", { id: "tx-1" })).result?.reason, 5);

  // ── cancel before perform: no access, payment CANCELLED
  w = world([order()]);
  await w.call("CreateTransaction", { id: "tx-a", time: clock, amount: 15_000_000, account: acct() });
  const cx = await w.call("CancelTransaction", { id: "tx-a", reason: 3 });
  assert.deepEqual([cx.result?.state, w.pay.get("pay-1")!.status, w.access.size], [-1, "CANCELLED", 0]);
  assert.equal((await w.call("PerformTransaction", { id: "tx-a" })).error?.code, -31008);

  // ── timeout: 12 hours without Perform → cancelled (reason 4), never paid
  w = world([order()]);
  await w.call("CreateTransaction", { id: "tx-t", time: clock, amount: 15_000_000, account: acct() });
  clock += PAYME_TIMEOUT_MS + 1;
  assert.equal((await w.call("PerformTransaction", { id: "tx-t" })).error?.code, -31008, "expired");
  const expired = await w.call("CheckTransaction", { id: "tx-t" });
  assert.deepEqual([expired.result?.state, expired.result?.reason, w.pay.get("pay-1")!.status, w.access.size], [-1, 4, "CANCELLED", 0]);

  // ── tampering that must never grant access
  w = world([order()]);
  await w.call("CreateTransaction", { id: "tx-x", time: clock, amount: 15_000_000, account: acct() });
  w.pay.get("pay-1")!.status = "CANCELLED"; // an administrator cancelled the order meanwhile
  assert.equal((await w.call("PerformTransaction", { id: "tx-x" })).error?.code, -31008); assert.equal(w.access.size, 0);

  // ── GetStatement
  w = world([order(), order({ id: "pay-2", providerPaymentId: "payme:pay-2" })]);
  await w.call("CreateTransaction", { id: "s1", time: 1000, amount: 15_000_000, account: acct("pay-1") });
  await w.call("CreateTransaction", { id: "s2", time: 5000, amount: 15_000_000, account: acct("pay-2") });
  const st = await w.call("GetStatement", { from: 900, to: 2000 });
  assert.deepEqual((st.result?.transactions as { id: string; account: { order_id: string } }[]).map((t) => [t.id, t.account.order_id]), [["s1", "pay-1"]]);
  assert.equal((await w.call("GetStatement", { from: 5, to: 1 })).error?.code, -32600);

  // ── checkout link
  process.env.PAYME_MERCHANT_ID = "5e730e8e0b852a417aa49ceb"; delete process.env.PAYME_CHECKOUT_URL;
  const provider = new PaymePaymentProvider();
  const s = await provider.createCheckout({ paymentId: "pay-9", amountCents: 15_000_000, currency: "UZS", description: "x", customerEmail: "a@b.co", successUrl: "https://acca.example/payments?paid=pay-9", cancelUrl: "https://acca.example/payments" });
  assert.ok(s.checkoutUrl.startsWith("https://checkout.paycom.uz/"));
  const decoded = Buffer.from(s.checkoutUrl.split("/").pop()!, "base64").toString();
  assert.equal(decoded, "m=5e730e8e0b852a417aa49ceb;ac.order_id=pay-9;a=15000000;cr=860;l=ru;c=https://acca.example/payments?paid=pay-9");
  await assert.rejects(() => provider.createCheckout({ paymentId: "p", amountCents: 1, currency: "USD", description: "x", customerEmail: "a@b.co", successUrl: "https://x", cancelUrl: "https://x" }), /sum only/);
  assert.deepEqual(provider.verifyWebhook(), { ok: false }, "the generic webhook route never trusts anything in payme mode");

  console.log("payme: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
