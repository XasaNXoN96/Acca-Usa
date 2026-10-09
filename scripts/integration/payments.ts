/**
 * Payment state machine, Stripe signature verification, event mapping and checkout request construction.
 * No network: Stripe is exercised through an injected fetch.   npm run test:payments
 */
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { applyProviderEvent } from "../../src/services/payments/process";
import { mapStripeEvent, StripePaymentProvider, verifyStripeSignature } from "../../src/services/payments/stripe-provider";
import type { PaymentRec, PaymentStore, ProviderEvent } from "../../src/services/payments/contracts";

function fakeStore(initial: PaymentRec[]) {
  const payments = new Map(initial.map((p) => [p.id, { ...p }]));
  const events = new Set<string>();
  const access = new Map<string, "ACTIVE" | "REVOKED">();
  const store: PaymentStore = {
    async findById(id) { return payments.get(id) ?? null; },
    async findByProviderRef(provider, ref) { return [...payments.values()].find((p) => p.provider === provider && p.providerPaymentId === ref) ?? null; },
    async recordEvent(provider, eventId) { const k = `${provider}:${eventId}`; if (events.has(k)) return false; events.add(k); return true; },
    async forgetEvent(provider, eventId) { events.delete(`${provider}:${eventId}`); },
    async update(id, patch) { Object.assign(payments.get(id)!, patch); },
    async grantAccess(userId, platform) { access.set(`${userId}:${platform}`, "ACTIVE"); },
    async revokeAccess(userId, platform) { access.set(`${userId}:${platform}`, "REVOKED"); },
    async userContact() { return null; },
  };
  return { store, payments, access };
}
const pending = (over: Partial<PaymentRec> = {}): PaymentRec => ({
  id: "pay-1", userId: "u1", platform: "acca", description: "ACCA — full access", amountCents: 14900, currency: "USD", status: "PENDING",
  provider: "stripe", providerPaymentId: "cs_1", createdAt: new Date().toISOString(), ...over,
});
const calls: string[] = [];
const notify = { async paymentReceived() { calls.push("received"); }, async paymentFailed() { calls.push("failed"); } };
const paid = (over: Partial<ProviderEvent> = {}): ProviderEvent => ({ eventId: "evt_1", type: "paid", paymentId: "pay-1", providerPaymentId: "cs_1", amountCents: 14900, currency: "usd", ...over });

async function main() {
  // ── access only from a verified paid event
  let s = fakeStore([pending()]);
  assert.equal(s.access.size, 0, "creating a payment grants nothing");
  assert.equal(await applyProviderEvent(s.store, "stripe", paid(), notify), "applied");
  assert.equal(s.payments.get("pay-1")!.status, "PAID");
  assert.ok(s.payments.get("pay-1")!.paidAt, "paidAt set");
  assert.equal(s.access.get("u1:acca"), "ACTIVE", "access granted by the paid event");
  assert.deepEqual(calls, ["received"]);

  // ── idempotency: a replayed delivery changes nothing
  assert.equal(await applyProviderEvent(s.store, "stripe", paid(), notify), "duplicate");
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ eventId: "evt_2" }), notify), "ignored", "a second paid event for a PAID payment is ignored");
  assert.deepEqual(calls, ["received"], "no duplicate notification");

  // ── amount / currency mismatch never grants access
  s = fakeStore([pending()]);
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ amountCents: 100 }), notify), "ignored");
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ eventId: "evt_9", currency: "eur" }), notify), "ignored");
  assert.equal(s.payments.get("pay-1")!.status, "PENDING");
  assert.equal(s.access.size, 0, "mismatched amount grants nothing");

  // ── a real provider's paid event WITHOUT amount or currency never grants access (only the demo simulation may omit them)
  s = fakeStore([pending()]);
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ amountCents: undefined }), notify), "ignored", "missing amount");
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ eventId: "evt_nc", currency: undefined }), notify), "ignored", "missing currency");
  assert.equal(s.access.size, 0);

  // ── unknown payment / wrong provider
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ paymentId: "nope", providerPaymentId: "nope" }), notify), "ignored");
  assert.equal(await applyProviderEvent(s.store, "demo", paid({ eventId: "evt_d" }), notify), "ignored", "an event from another provider cannot touch this payment");
  assert.equal(s.access.size, 0);

  // ── lookup by provider reference when metadata is missing
  s = fakeStore([pending()]);
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ paymentId: undefined }), notify), "applied");

  // ── failure paths
  s = fakeStore([pending()]);
  calls.length = 0;
  assert.equal(await applyProviderEvent(s.store, "stripe", { eventId: "e1", type: "failed", paymentId: "pay-1" }, notify), "applied");
  assert.equal(s.payments.get("pay-1")!.status, "FAILED");
  assert.deepEqual(calls, ["failed"]);
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ eventId: "e2" }), notify), "applied", "a retry that finally succeeds can still be paid");
  s = fakeStore([pending()]);
  assert.equal(await applyProviderEvent(s.store, "stripe", { eventId: "e3", type: "cancelled", paymentId: "pay-1" }, notify), "applied");
  assert.equal(s.payments.get("pay-1")!.status, "CANCELLED");
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ eventId: "e4" }), notify), "ignored", "a cancelled checkout cannot be paid later");
  assert.equal(s.access.size, 0);

  // ── refund withdraws access (and only after paid)
  s = fakeStore([pending()]);
  assert.equal(await applyProviderEvent(s.store, "stripe", { eventId: "r0", type: "refunded", paymentId: "pay-1" }, notify), "ignored", "refund before payment is ignored");
  await applyProviderEvent(s.store, "stripe", paid(), notify);
  assert.equal(await applyProviderEvent(s.store, "stripe", { eventId: "r1", type: "refunded", paymentId: "pay-1" }, notify), "applied");
  assert.equal(s.payments.get("pay-1")!.status, "REFUNDED");
  assert.equal(s.access.get("u1:acca"), "REVOKED");

  // ── a failure while applying un-records the event so the provider's retry is applied
  s = fakeStore([pending()]);
  const failingStore: PaymentStore = { ...s.store, grantAccess: async () => { throw new Error("db down"); } };
  await assert.rejects(() => applyProviderEvent(failingStore, "stripe", paid({ eventId: "evt_f" }), notify));
  assert.equal(s.payments.get("pay-1")!.status, "PENDING", "a failed attempt leaves the payment untouched");
  assert.equal(await applyProviderEvent(s.store, "stripe", paid({ eventId: "evt_f" }), notify), "applied", "retry after a failure is applied, not skipped");

  // ── Stripe signature verification
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", amount_total: 14900, currency: "usd", metadata: { paymentId: "pay-1" } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = (ts: number, b = body, key = secret) => `t=${ts},v1=${createHmac("sha256", key).update(`${ts}.${b}`).digest("hex")}`;
  assert.equal(verifyStripeSignature(body, sig(t), secret), true, "valid signature");
  assert.equal(verifyStripeSignature(body + " ", sig(t), secret), false, "tampered body");
  assert.equal(verifyStripeSignature(body, sig(t, body, "other"), secret), false, "wrong secret");
  assert.equal(verifyStripeSignature(body, sig(t - 3600), secret), false, "old timestamp (replay)");
  assert.equal(verifyStripeSignature(body, null, secret), false, "missing header");
  assert.equal(verifyStripeSignature(body, "t=abc,v1=zz", secret), false, "garbage header");
  assert.equal(verifyStripeSignature(body, sig(t), ""), false, "no configured secret never verifies");
  assert.equal(verifyStripeSignature(body, `${sig(t)},v1=${"0".repeat(64)}`, secret), true, "any matching v1 entry is enough");

  // ── Stripe mode from the key prefix; the API base can be redirected only for TEST keys
  const { stripeMode, stripeApiBase, STRIPE_API } = await import("../../src/lib/stripe-mode");
  assert.deepEqual(["sk_test_1", "rk_test_1", "sk_live_1", "rk_live_1", "whsec_x", "", undefined].map(stripeMode), ["test", "test", "live", "live", "invalid", "missing", "missing"]);
  assert.equal(stripeApiBase("sk_test_1", "http://127.0.0.1:9/v1/"), "http://127.0.0.1:9/v1");
  assert.equal(stripeApiBase("sk_live_1", "http://127.0.0.1:9/v1"), STRIPE_API, "a live key can never be redirected");
  assert.equal(stripeApiBase("sk_test_1", "javascript:alert(1)"), STRIPE_API, "non-http override ignored");
  assert.equal(stripeApiBase("sk_test_1", undefined), STRIPE_API);

  // ── event mapping
  assert.deepEqual(mapStripeEvent(JSON.parse(body)), { eventId: "evt_1", type: "paid", paymentId: "pay-1", providerPaymentId: "cs_1", amountCents: 14900, currency: "usd" });
  assert.equal(mapStripeEvent({ id: "e", type: "checkout.session.completed", data: { object: { id: "cs", payment_status: "unpaid" } } }), null, "completed but unpaid is not a payment");
  assert.equal(mapStripeEvent({ id: "e", type: "customer.created", data: { object: { id: "c" } } }), null, "unrelated events are ignored");
  assert.equal(mapStripeEvent({ id: "e", type: "checkout.session.expired", data: { object: { id: "cs", metadata: { paymentId: "p" } } } })?.type, "cancelled");
  assert.equal(mapStripeEvent({ id: "e", type: "charge.refunded", data: { object: { amount: 100, amount_refunded: 50, metadata: { paymentId: "p" } } } }), null, "partial refund keeps access");
  assert.equal(mapStripeEvent({ id: "e", type: "charge.refunded", data: { object: { amount: 100, amount_refunded: 100, metadata: { paymentId: "p" } } } })?.type, "refunded");

  // ── webhook verification through the provider
  process.env.PAYMENT_WEBHOOK_SECRET = secret;
  process.env.PAYMENT_SECRET_KEY = "sk_test_x";
  const provider = new StripePaymentProvider();
  assert.deepEqual(provider.verifyWebhook(body, new Headers({ "stripe-signature": sig(t) })).ok, true);
  assert.deepEqual(provider.verifyWebhook(body, new Headers()), { ok: false });
  assert.deepEqual(provider.verifyWebhook("not json", new Headers({ "stripe-signature": sig(t, "not json") })), { ok: false });

  // ── checkout request (fake fetch)
  let seen: { url: string; init: RequestInit } | undefined;
  const fake = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new" }), { status: 200 }); }) as unknown as typeof fetch;
  const session = await new StripePaymentProvider(fake).createCheckout({
    paymentId: "pay-9", amountCents: 14900, currency: "USD", description: "ACCA — full access", customerEmail: "a@b.co", successUrl: "https://x/ok", cancelUrl: "https://x/no",
  });
  assert.deepEqual(session, { providerPaymentId: "cs_new", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_new" });
  const form = new URLSearchParams(String(seen!.init.body));
  assert.equal(seen!.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "14900", "amount comes from our database record");
  assert.equal(form.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(form.get("metadata[paymentId]"), "pay-9");
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Bearer sk_test_x");
  assert.equal((seen!.init.headers as Record<string, string>)["Idempotency-Key"], "pay-9");
  const bad = (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch;
  await assert.rejects(() => new StripePaymentProvider(bad).createCheckout({ paymentId: "p", amountCents: 1, currency: "USD", description: "d", customerEmail: "a@b.co", successUrl: "https://x", cancelUrl: "https://x" }));
  console.log("payments: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
