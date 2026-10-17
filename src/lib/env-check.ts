/**
 * Environment validation (pure — no server-only import, so scripts and tests can use it).
 * Only variable NAMES and reasons are ever reported; values (secrets) are never echoed.
 *
 *  • demo mode        nothing is required; it runs standalone on demo data.
 *  • production mode  every real provider must be configured, and no demo behaviour may remain enabled.
 */
import { stripeMode } from "./stripe-mode";

export type EnvGroup = "core" | "s3" | "smtp" | "payments" | "legal";
export interface EnvIssue { name: string; reason: string; group: EnvGroup }

/** Each variable belongs to one feature group, so a problem in one group never blocks the use of another (see `assertEnv`). */
export function groupOf(name: string): EnvGroup {
  if (name.startsWith("S3_")) return "s3";
  if (name.startsWith("SMTP_") || name === "EMAIL_FROM") return "smtp";
  if (name.startsWith("PAYMENT") || name.startsWith("STRIPE_")) return "payments";
  if (name.startsWith("LEGAL_")) return "legal";
  return "core";
}

type Env = Record<string, string | undefined>;
const has = (v: string | undefined) => !!v && v.trim().length > 0;
const isUrl = (v: string | undefined, protocols: string[]) => {
  try { return !!v && protocols.includes(new URL(v).protocol); } catch { return false; }
};

export function validateEnv(env: Env = process.env): { mode: "demo" | "production"; issues: EnvIssue[] } {
  const mode = env.NEXT_PUBLIC_APP_MODE === "production" ? "production" : "demo";
  const issues: EnvIssue[] = [];
  const add = (name: string, reason: string) => { issues.push({ name, reason, group: groupOf(name) }); };
  const need = (name: string, reason = "required in production") => { if (!has(env[name])) add(name, reason); };

  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) add("AUTH_SECRET", "must be at least 32 characters");
  if (env.NEXT_PUBLIC_APP_MODE && !["demo", "production"].includes(env.NEXT_PUBLIC_APP_MODE)) add("NEXT_PUBLIC_APP_MODE", "must be 'demo' or 'production'");
  if (env.DATA_PROVIDER && !["memory", "prisma"].includes(env.DATA_PROVIDER)) add("DATA_PROVIDER", "must be 'memory' or 'prisma'");
  if (mode === "demo") return { mode, issues };

  // ── production ──
  need("AUTH_SECRET");
  if (env.DATA_PROVIDER !== "prisma") add("DATA_PROVIDER", "must be 'prisma' in production (the in-memory database is demo-only)");
  need("DATABASE_URL");
  if (has(env.DATABASE_URL) && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL!)) add("DATABASE_URL", "must be a postgresql:// URL");
  need("APP_URL");
  if (has(env.APP_URL) && !isUrl(env.APP_URL, ["https:"])) add("APP_URL", "must be the public https:// URL of the site");

  for (const name of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) need(name, "required in production (object storage)");
  if (has(env.S3_ENDPOINT) && !isUrl(env.S3_ENDPOINT, ["https:", "http:"])) add("S3_ENDPOINT", "must be an http(s) URL");

  // The legal pages must name the operator, the privacy contact and where data is stored — never an invented company.
  for (const name of ["LEGAL_OPERATOR_NAME", "LEGAL_CONTACT_EMAIL", "LEGAL_DATA_LOCATION"]) need(name, "required in production (legal pages)");
  if (has(env.LEGAL_CONTACT_EMAIL) && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.LEGAL_CONTACT_EMAIL!.trim())) add("LEGAL_CONTACT_EMAIL", "must be an e-mail address");
  if (env.LEGAL_TEXTS_REVIEWED && env.LEGAL_TEXTS_REVIEWED !== "1") add("LEGAL_TEXTS_REVIEWED", "must be 1 (counsel has reviewed the texts) or unset");

  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"]) need(name, "required in production (e-mail)");
  if (has(env.SMTP_PORT) && !/^\d{2,5}$/.test(env.SMTP_PORT!)) add("SMTP_PORT", "must be a port number");
  if (has(env.EMAIL_FROM) && !/^([^<>\r\n]+<)?[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+>?$/.test(env.EMAIL_FROM!.trim())) add("EMAIL_FROM", "must be an address like no-reply@example.com or Name <no-reply@example.com>");
  if (has(env.SMTP_SECURE) && !["0", "1"].includes(env.SMTP_SECURE!)) add("SMTP_SECURE", "must be 0 or 1");

  // Online payments are an explicit decision: `none` (access is granted by an administrator, no Stripe variables needed) or `stripe`.
  const payments = env.PAYMENTS_PROVIDER;
  if (!has(payments)) add("PAYMENTS_PROVIDER", "required in production: 'none' (online payments off) or 'stripe'");
  else if (payments !== "none" && payments !== "stripe") add("PAYMENTS_PROVIDER", "must be 'none' or 'stripe'");
  if (payments === "stripe") {
    need("PAYMENT_SECRET_KEY", "required when PAYMENTS_PROVIDER=stripe");
    need("PAYMENT_WEBHOOK_SECRET", "required when PAYMENTS_PROVIDER=stripe (payment webhooks)");
    if (has(env.PAYMENT_SECRET_KEY) && stripeMode(env.PAYMENT_SECRET_KEY) === "invalid") add("PAYMENT_SECRET_KEY", "must be a Stripe secret key (sk_test_… or sk_live_…)");
    if (has(env.PAYMENT_WEBHOOK_SECRET) && !/^whsec_/.test(env.PAYMENT_WEBHOOK_SECRET!)) add("PAYMENT_WEBHOOK_SECRET", "must be a Stripe webhook signing secret (whsec_…)");
    if (has(env.STRIPE_API_BASE) && stripeMode(env.PAYMENT_SECRET_KEY) !== "test") add("STRIPE_API_BASE", "may only be set together with a Stripe TEST key (sk_test_…)");
  }

  if (env.DEMO_LOGIN === "1") add("DEMO_LOGIN", "demo logins must be disabled in production");
  return { mode, issues };
}

/**
 * Throws one readable error listing every problem (names only). A no-op in demo mode unless a value is malformed.
 * With `groups` only those feature groups are checked: the S3 accessor asks for ["s3"], so a payments or e-mail problem can
 * never break file upload, and vice versa. Startup (src/instrumentation.ts) checks everything.
 */
export function assertEnv(env: Env = process.env, groups?: readonly EnvGroup[]): void {
  const { mode, issues: all } = validateEnv(env);
  const issues = groups ? all.filter((i) => groups.includes(i.group)) : all;
  if (!issues.length) return;
  const lines = issues.map((i) => `  - ${i.name}: ${i.reason}`).join("\n");
  const message = `Invalid environment (${mode} mode):\n${lines}\nSee docs/DEPLOYMENT_MODES.md.`;
  throw new Error(message); // demo mode only reaches here for a malformed optional value — surface it early too
}
