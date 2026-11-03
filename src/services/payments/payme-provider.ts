import "server-only";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookVerification } from "./contracts";

/**
 * Payme (Uzbekistan). The shop does not call Payme to create a charge: it sends the student to Payme's hosted checkout with a link that
 * carries the merchant id, OUR payment id (as the account) and the amount in tiyin. Payme then calls /api/payments/payme (payme-rpc.ts).
 *   PAYMENTS_PROVIDER=payme  PAYME_MERCHANT_ID  PAYME_KEY  [PAYME_CHECKOUT_URL]  PRICE_CURRENCY=UZS
 * PAYME_CHECKOUT_URL defaults to https://checkout.paycom.uz (Payme's test environment uses https://test.paycom.uz).
 */
export class PaymePaymentProvider implements PaymentProvider {
  readonly name = "payme" as const;

  async createCheckout(r: CheckoutRequest): Promise<CheckoutSession> {
    const merchant = process.env.PAYME_MERCHANT_ID;
    if (!merchant) throw new Error("PAYME_MERCHANT_ID missing");
    if (r.currency.toUpperCase() !== "UZS") throw new Error("Payme charges Uzbek sum only");
    const base = (process.env.PAYME_CHECKOUT_URL || "https://checkout.paycom.uz").replace(/\/$/, "");
    const params = [`m=${merchant}`, `ac.order_id=${r.paymentId}`, `a=${r.amountCents}`, "cr=860", "l=ru", `c=${r.successUrl}`].join(";");
    return { providerPaymentId: `payme:${r.paymentId}`, checkoutUrl: `${base}/${Buffer.from(params, "utf8").toString("base64")}` };
  }

  /** Payme does not use the generic webhook route: it calls the Merchant API endpoint. Nothing sent here is ever trusted. */
  verifyWebhook(): WebhookVerification {
    return { ok: false };
  }
}
