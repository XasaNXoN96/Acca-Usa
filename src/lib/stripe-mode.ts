/**
 * Which Stripe environment a secret key belongs to, from its PREFIX only (pure — no secret is stored or logged).
 *   sk_test_ / rk_test_  → "test"    sk_live_ / rk_live_ → "live"    anything else → "invalid"    empty → "missing"
 */
export type StripeMode = "test" | "live" | "invalid" | "missing";

export function stripeMode(key: string | undefined): StripeMode {
  const k = (key ?? "").trim();
  if (!k) return "missing";
  if (/^(sk|rk)_test_/.test(k)) return "test";
  if (/^(sk|rk)_live_/.test(k)) return "live";
  return "invalid";
}

/** The API base may be redirected (to a local fake / proxy) ONLY for test keys — a live key can never be sent elsewhere. */
export const STRIPE_API = "https://api.stripe.com/v1";
export function stripeApiBase(key: string | undefined, override: string | undefined): string {
  if (!override) return STRIPE_API;
  if (stripeMode(key) !== "test") return STRIPE_API;
  try { const u = new URL(override); return (u.protocol === "https:" || u.protocol === "http:") ? override.replace(/\/+$/, "") : STRIPE_API; } catch { return STRIPE_API; }
}
