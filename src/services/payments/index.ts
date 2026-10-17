import "server-only";
import { paymentsMode } from "@/lib/payments-mode";
import type { PaymentProvider } from "./contracts";
import { DemoPaymentProvider } from "./demo-provider";
import { DisabledPaymentProvider } from "./disabled-provider";
import { StripePaymentProvider } from "./stripe-provider";

const g = globalThis as unknown as { __accaPayments?: PaymentProvider };

/** Composition root for payments — the only place that knows which provider is active. */
export function getPaymentProvider(): PaymentProvider {
  if (!g.__accaPayments) {
    const mode = paymentsMode();
    g.__accaPayments = mode === "demo" ? new DemoPaymentProvider() : mode === "stripe" ? new StripePaymentProvider() : new DisabledPaymentProvider();
  }
  return g.__accaPayments;
}
