import "server-only";
import { randomUUID } from "node:crypto";
import { routes } from "@/lib/routes";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookVerification } from "./contracts";

/**
 * DEMO payment simulation. It never touches real money: checkout leads to an on-site page that is clearly labelled as a
 * simulation and only exists in demo mode (the page and the action both 404 / refuse in production). It has no webhook,
 * so it cannot be used to forge a payment against a production provider.
 */
export class DemoPaymentProvider implements PaymentProvider {
  readonly name = "demo" as const;
  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    return { providerPaymentId: `demo_${randomUUID()}`, checkoutUrl: `${routes.payments}/demo-checkout/${encodeURIComponent(r.paymentId)}` };
  }
  verifyWebhook(): WebhookVerification {
    return { ok: false };
  }
}
