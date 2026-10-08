import type { Locale, PlatformSlug } from "@/types";

export type PaymentState = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

/** A payment as the business layer sees it (amounts are integers in the smallest currency unit). */
export interface PaymentRec {
  id: string;
  userId: string;
  platform: PlatformSlug;
  description: string;
  amountCents: number;
  currency: string;
  status: PaymentState;
  provider: string;
  providerPaymentId?: string;
  checkoutUrl?: string;
  idempotencyKey?: string;
  paidAt?: string;
  createdAt: string;
}

export interface CheckoutRequest {
  paymentId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}
export interface CheckoutSession { providerPaymentId: string; checkoutUrl: string }

/** What a provider tells us happened — already authenticated (signature verified) by the provider adapter. */
export interface ProviderEvent {
  /** the provider's unique event id: replays carry the same id and are ignored (idempotency) */
  eventId: string;
  type: "paid" | "failed" | "cancelled" | "refunded";
  /** our payment id, echoed back from checkout metadata */
  paymentId?: string;
  providerPaymentId?: string;
  amountCents?: number;
  currency?: string;
}

export type WebhookVerification = { ok: true; event: ProviderEvent | null } | { ok: false };

/**
 * Payment provider. Business code depends on this interface only.
 *  - DemoPaymentProvider: a clearly-labelled simulation (demo mode only; unreachable in production)
 *  - StripePaymentProvider: Stripe Checkout + signed webhooks (production)
 */
export interface PaymentProvider {
  readonly name: "demo" | "stripe";
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Authenticates a webhook delivery from its RAW body + headers. `event: null` = authentic but irrelevant. */
  verifyWebhook(rawBody: string, headers: Headers): WebhookVerification;
}

/** Persistence needed by the payment state machine — implemented once per data provider. */
export interface PaymentStore {
  findById(id: string): Promise<PaymentRec | null>;
  findByProviderRef(provider: string, providerPaymentId: string): Promise<PaymentRec | null>;
  /** Records a delivery; returns false when (provider, eventId) was already seen. */
  recordEvent(provider: string, eventId: string, paymentId: string | null, type: string): Promise<boolean>;
  /** Compensation: un-records a delivery whose processing failed, so the provider's retry is applied instead of skipped. */
  forgetEvent(provider: string, eventId: string): Promise<void>;
  update(id: string, patch: Partial<Pick<PaymentRec, "status" | "paidAt" | "providerPaymentId">>): Promise<void>;
  /** Idempotent: creates or re-activates the enrolment of the payer for the platform. */
  grantAccess(userId: string, platform: PlatformSlug, paymentId: string): Promise<void>;
  revokeAccess(userId: string, platform: PlatformSlug, paymentId: string): Promise<void>;
  userContact(userId: string): Promise<{ name: string; email: string; locale: Locale } | null>;
}

export type ProcessOutcome = "applied" | "duplicate" | "ignored";
