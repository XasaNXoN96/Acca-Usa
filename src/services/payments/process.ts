import "server-only";
import { routes } from "@/lib/routes";
import { audit } from "@/lib/audit";
import { logEvent } from "@/lib/log";
import { absoluteUrl, sendEmail } from "../email";
import type { PaymentProvider, PaymentRec, PaymentStore, ProcessOutcome, ProviderEvent } from "./contracts";

/** Allowed status transitions. A payment can only move forward; replays and out-of-order deliveries are ignored. */
const allowed: Record<ProviderEvent["type"], PaymentRec["status"][]> = {
  paid: ["PENDING", "FAILED"],
  failed: ["PENDING"],
  cancelled: ["PENDING"],
  refunded: ["PAID"],
};
const next = { paid: "PAID", failed: "FAILED", cancelled: "CANCELLED", refunded: "REFUNDED" } as const;

export interface Notifier {
  paymentReceived(userId: string, payment: PaymentRec): Promise<void>;
  paymentFailed(userId: string, payment: PaymentRec): Promise<void>;
}

/**
 * Applies one AUTHENTICATED provider event to the payment ledger.
 *  • idempotent: the same (provider, eventId) is applied once
 *  • access is granted ONLY here, on a verified `paid` event whose amount and currency match the stored payment
 *  • a refund withdraws the access that payment granted
 * The browser never reaches this function: it is called from the webhook route (signature verified) — and from the demo
 * simulation, which exists only in demo mode.
 */
export async function applyProviderEvent(store: PaymentStore, provider: PaymentProvider["name"], event: ProviderEvent, notify: Notifier): Promise<ProcessOutcome> {
  const payment =
    (event.paymentId ? await store.findById(event.paymentId) : null) ??
    (event.providerPaymentId ? await store.findByProviderRef(provider, event.providerPaymentId) : null);
  if (!payment || payment.provider !== provider) {
    logEvent("warn", "payment.event_unknown_payment", { provider, type: event.type });
    return "ignored";
  }
  if (!(await store.recordEvent(provider, event.eventId, payment.id, event.type))) return "duplicate";
  try {
    if (!allowed[event.type].includes(payment.status)) return "ignored";

    if (event.type === "paid") {
      // A real provider must state what was paid: an event WITHOUT amount / currency never grants access.
      const strict = provider !== "demo";
      const amountOk = event.amountCents === undefined ? !strict : event.amountCents === payment.amountCents;
      const currencyOk = !event.currency ? !strict : event.currency.toUpperCase() === payment.currency.toUpperCase();
      if (!amountOk || !currencyOk) {
        logEvent("error", "payment.amount_mismatch", { provider, paymentId: payment.id });
        return "ignored"; // never grant access for an amount we did not ask for
      }
    }

    // Side effects first, the status flip last: if anything throws, the payment is still in its old state, so the
    // provider's retry (the event record is withdrawn below) is applied instead of being mistaken for a replay.
    if (event.type === "paid") await store.grantAccess(payment.userId, payment.platform, payment.id);
    else if (event.type === "refunded") await store.revokeAccess(payment.userId, payment.platform, payment.id);
    await store.update(payment.id, {
      status: next[event.type],
      providerPaymentId: payment.providerPaymentId ?? event.providerPaymentId,
      ...(event.type === "paid" ? { paidAt: new Date().toISOString() } : {}),
    });
    await audit({ actor: { type: "system", id: provider }, action: `payment.${next[event.type].toLowerCase()}`, target: { type: "payment", id: payment.id }, meta: { provider, amountCents: payment.amountCents, currency: payment.currency, platform: payment.platform } });
    if (event.type === "paid") await notify.paymentReceived(payment.userId, payment);
    else if (event.type === "failed") await notify.paymentFailed(payment.userId, payment);
    return "applied";
  } catch (e) {
    await store.forgetEvent(provider, event.eventId).catch(() => undefined);
    throw e; // the webhook answers 500 and the provider retries
  }
}

export const formatAmount = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/** E-mail side of the notifier (the in-app notification part is data-provider specific). */
export async function emailPaymentReceived(store: PaymentStore, p: PaymentRec) {
  const u = await store.userContact(p.userId);
  if (u) await sendEmail({ email: u.email, locale: u.locale }, { kind: "paymentConfirmation", name: u.name, description: p.description, amount: formatAmount(p.amountCents, p.currency), paymentId: p.id });
}
export async function emailPaymentFailed(store: PaymentStore, p: PaymentRec) {
  const u = await store.userContact(p.userId);
  if (u) await sendEmail({ email: u.email, locale: u.locale }, { kind: "paymentFailed", name: u.name, description: p.description, retryUrl: absoluteUrl(routes.payments) });
}
