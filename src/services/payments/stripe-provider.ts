import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { stripeApiBase } from "@/lib/stripe-mode";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, ProviderEvent, WebhookVerification } from "./contracts";

const TOLERANCE_SECONDS = 300;

/** Stripe-Signature: `t=<unix>,v1=<hex hmac of "t.payload">[,v1=…]` — constant-time compare, 5-minute replay window. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return signatures.some((s) => {
    const given = Buffer.from(s);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

interface StripeObject {
  id?: string;
  object?: string;
  payment_status?: string;
  amount_total?: number;
  amount?: number;
  amount_refunded?: number;
  currency?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  payment_intent?: string | null;
}

/** Maps a (verified) Stripe event to our provider-neutral event. Unknown types are authentic but irrelevant → null. */
export function mapStripeEvent(raw: unknown): ProviderEvent | null {
  const e = raw as { id?: string; type?: string; data?: { object?: StripeObject } };
  const o = e.data?.object;
  if (!e.id || !e.type || !o) return null;
  const paymentId = o.metadata?.paymentId ?? o.client_reference_id ?? undefined;
  switch (e.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return o.payment_status === "paid" ? { eventId: e.id, type: "paid", paymentId, providerPaymentId: o.id, amountCents: o.amount_total, currency: o.currency } : null;
    case "checkout.session.async_payment_failed":
      return { eventId: e.id, type: "failed", paymentId, providerPaymentId: o.id };
    case "checkout.session.expired":
      return { eventId: e.id, type: "cancelled", paymentId, providerPaymentId: o.id };
    case "charge.refunded":
      // Only a FULL refund withdraws access.
      return o.amount && o.amount_refunded === o.amount ? { eventId: e.id, type: "refunded", paymentId: o.metadata?.paymentId } : null;
    default:
      return null;
  }
}

/** Stripe Checkout (hosted page) over the REST API — no SDK, no card data ever touches our servers. */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    const body = new URLSearchParams({
      mode: "payment",
      client_reference_id: r.paymentId,
      customer_email: r.customerEmail,
      success_url: r.successUrl,
      cancel_url: r.cancelUrl,
      "metadata[paymentId]": r.paymentId,
      "payment_intent_data[metadata][paymentId]": r.paymentId,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": r.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(r.amountCents),
      "line_items[0][price_data][product_data][name]": r.description,
    });
    const key = serverEnv.payment().secretKey;
    const res = await this.fetchImpl(`${stripeApiBase(key, process.env.STRIPE_API_BASE)}/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": r.paymentId },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string };
    if (!res.ok || !json.id || !json.url) throw new Error(`Stripe checkout failed (${res.status})`);
    // The browser is sent to this URL: it must be https (or http only against the test-key API override).
    let target: URL;
    try { target = new URL(json.url); } catch { throw new Error("Stripe checkout returned an invalid URL"); }
    if (target.protocol !== "https:" && !(process.env.STRIPE_API_BASE && target.protocol === "http:")) throw new Error("Stripe checkout returned a non-https URL");
    return { providerPaymentId: json.id, checkoutUrl: json.url };
  }

  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification {
    if (!verifyStripeSignature(rawBody, headers.get("stripe-signature"), serverEnv.payment().webhookSecret)) return { ok: false };
    try {
      return { ok: true, event: mapStripeEvent(JSON.parse(rawBody)) };
    } catch {
      return { ok: false };
    }
  }
}
