/**
 * The single currency of the shop. Prices, payments and statistics are all in it.
 *   PRICE_CURRENCY=UZS   Uzbek sum (the plan for the real launch)
 *   PRICE_CURRENCY=USD   default (demo, Stripe)
 * Amounts are stored as integers in the minor unit (cents / tiyin = 1/100), exactly as payment providers expect them.
 * Read on the server only; client components receive the currency as a prop (see EnrollControl).
 */
export type Currency = "USD" | "UZS";

export const siteCurrency = (): Currency => (process.env.PRICE_CURRENCY === "UZS" ? "UZS" : "USD");

/** Largest price an administrator may type, in WHOLE units (the column is a 32-bit integer of minor units: 20 000 000 × 100 < 2^31). Same for every currency so browser and server agree. */
export const MAX_PRICE_UNITS = 20_000_000;
