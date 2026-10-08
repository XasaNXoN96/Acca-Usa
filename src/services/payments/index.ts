import "server-only";
import { APP_MODE } from "@/lib/app-mode";
import type { PaymentProvider } from "./contracts";
import { DemoPaymentProvider } from "./demo-provider";
import { StripePaymentProvider } from "./stripe-provider";

const g = globalThis as unknown as { __accaPayments?: PaymentProvider };

/** Composition root for payments — the only place that knows which provider is active. */
export function getPaymentProvider(): PaymentProvider {
  return (g.__accaPayments ??= APP_MODE === "demo" ? new DemoPaymentProvider() : new StripePaymentProvider());
}
