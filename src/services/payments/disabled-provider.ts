import "server-only";
import type { CheckoutSession, PaymentProvider, WebhookVerification } from "./contracts";

/**
 * Online payments are switched off (PAYMENTS_PROVIDER=none). It cannot create a checkout and authenticates nothing, so there is
 * no way for a payment — real or forged — to reach the state machine that grants access.
 */
export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = "none" as const;
  async createCheckout(): Promise<CheckoutSession> {
    throw new Error("PAYMENTS_DISABLED");
  }
  verifyWebhook(): WebhookVerification {
    return { ok: false };
  }
}
