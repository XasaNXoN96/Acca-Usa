/**
 * Online payments OFF (PAYMENTS_PROVIDER=none): the provider, the mode resolution and the state machine guard — no network, no database.
 * npm run test:payments-off
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { DisabledPaymentProvider } from "../../src/services/payments/disabled-provider";
import { applyProviderEvent } from "../../src/services/payments/process";
import type { PaymentRec, PaymentStore, ProviderEvent } from "../../src/services/payments/contracts";

// ── mode resolution (each case in its own process: APP_MODE is read at import time)
const mode = (env: Record<string, string>) => {
  const r = spawnSync(process.execPath, ["--import", "tsx", "-e", 'import("./src/lib/payments-mode.ts").then((m) => console.log((m.paymentsMode ?? m.default.paymentsMode)()))'], { env: { ...process.env, NEXT_PUBLIC_APP_MODE: "", PAYMENTS_PROVIDER: "", ...env }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
};
assert.equal(mode({}), "demo", "demo mode is the simulation");
assert.equal(mode({ PAYMENTS_PROVIDER: "stripe" }), "demo", "demo ignores PAYMENTS_PROVIDER");
assert.equal(mode({ NEXT_PUBLIC_APP_MODE: "production", PAYMENTS_PROVIDER: "stripe" }), "stripe");
assert.equal(mode({ NEXT_PUBLIC_APP_MODE: "production", PAYMENTS_PROVIDER: "none" }), "none");
assert.equal(mode({ NEXT_PUBLIC_APP_MODE: "production" }), "none", "unset resolves to OFF (fail closed; env-check refuses to start anyway)");
assert.equal(mode({ NEXT_PUBLIC_APP_MODE: "production", PAYMENTS_PROVIDER: "STRIPE" }), "none", "anything but exactly 'stripe' is off");

// ── the disabled provider can neither start a checkout nor authenticate a webhook
async function main() {
  const p = new DisabledPaymentProvider();
  assert.equal(p.name, "none");
  await assert.rejects(() => p.createCheckout(), /PAYMENTS_DISABLED/);
  assert.deepEqual(p.verifyWebhook(), { ok: false });

  // ── the state machine refuses everything while payments are off, even a perfectly valid paid / refund event
  const child = spawnSync(process.execPath, ["-r", "./scripts/integration/stub-server-only.cjs", "--import", "tsx", "scripts/integration/payments-off.ts", "--machine"], { env: { ...process.env, NEXT_PUBLIC_APP_MODE: "production", PAYMENTS_PROVIDER: "none" }, encoding: "utf8" });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.match(child.stdout, /machine ok/);
  console.log("payments-off: all checks passed");
}

async function machine() {
  const pay: PaymentRec = { id: "pay-1", userId: "u1", platform: "fia", description: "FIA", amountCents: 2900, currency: "USD", status: "PENDING", provider: "stripe", providerPaymentId: "cs_1", createdAt: new Date().toISOString() };
  const calls: string[] = []; const events = new Set<string>();
  const store: PaymentStore = {
    async findById() { calls.push("findById"); return { ...pay }; },
    async findByProviderRef() { calls.push("findByProviderRef"); return { ...pay }; },
    async recordEvent(prov, id) { calls.push("recordEvent"); const k = `${prov}:${id}`; if (events.has(k)) return false; events.add(k); return true; },
    async forgetEvent() { calls.push("forgetEvent"); },
    async update() { calls.push("update"); },
    async grantAccess() { calls.push("grantAccess"); },
    async revokeAccess() { calls.push("revokeAccess"); },
    async userContact() { return null; },
  };
  const notifier = { async paymentReceived() { calls.push("notify"); }, async paymentFailed() { calls.push("notify"); } };
  const evs: ProviderEvent[] = [
    { eventId: "e1", type: "paid", paymentId: "pay-1", providerPaymentId: "cs_1", amountCents: 2900, currency: "usd" },
    { eventId: "e2", type: "refunded", paymentId: "pay-1" }, { eventId: "e3", type: "failed", paymentId: "pay-1" }, { eventId: "e4", type: "cancelled", paymentId: "pay-1" },
  ];
  for (const provider of ["stripe", "demo", "none"] as const) for (const e of evs) assert.equal(await applyProviderEvent(store, provider, e, notifier), "ignored", `${provider}/${e.type} must be ignored while payments are off`);
  assert.deepEqual(calls, [], `the store / notifier were touched while payments are off: ${calls.join(",")}`);
  console.log("machine ok");
}
(process.argv.includes("--machine") ? machine() : main()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
