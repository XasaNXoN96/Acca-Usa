import { APP_MODE } from "./app-mode";

/**
 * Which payment mode this deployment runs in.
 *   demo    simulated checkout (demo mode only)
 *   stripe  Stripe Checkout + signed webhooks (PAYMENTS_PROVIDER=stripe)
 *   none    online payments OFF: no checkout, no payment rows, no webhook — access is granted by an administrator only
 * Anything that is not exactly `stripe` in production resolves to `none` (fail closed); env-check refuses to start with a missing
 * or unknown PAYMENTS_PROVIDER, so this fallback only matters for scripts and tests.
 */
export type PaymentsMode = "demo" | "stripe" | "none";

export const paymentsMode = (): PaymentsMode => (APP_MODE === "demo" ? "demo" : process.env.PAYMENTS_PROVIDER === "stripe" ? "stripe" : "none");
