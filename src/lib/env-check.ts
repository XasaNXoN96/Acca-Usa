/**
 * Environment validation (pure — no server-only import, so scripts and tests can use it).
 * Only variable NAMES and reasons are ever reported; values (secrets) are never echoed.
 *
 *  • demo mode        nothing is required; it runs standalone on demo data.
 *  • production mode  every real provider must be configured, and no demo behaviour may remain enabled.
 */
import { stripeMode } from "./stripe-mode";

export interface EnvIssue { name: string; reason: string }

type Env = Record<string, string | undefined>;
const has = (v: string | undefined) => !!v && v.trim().length > 0;
const isUrl = (v: string | undefined, protocols: string[]) => {
  try { return !!v && protocols.includes(new URL(v).protocol); } catch { return false; }
};

export function validateEnv(env: Env = process.env): { mode: "demo" | "production"; issues: EnvIssue[] } {
  const mode = env.NEXT_PUBLIC_APP_MODE === "production" ? "production" : "demo";
  const issues: EnvIssue[] = [];
  const need = (name: string, reason = "required in production") => { if (!has(env[name])) issues.push({ name, reason }); };

  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) issues.push({ name: "AUTH_SECRET", reason: "must be at least 32 characters" });
  if (env.NEXT_PUBLIC_APP_MODE && !["demo", "production"].includes(env.NEXT_PUBLIC_APP_MODE)) issues.push({ name: "NEXT_PUBLIC_APP_MODE", reason: "must be 'demo' or 'production'" });
  if (env.DATA_PROVIDER && !["memory", "prisma"].includes(env.DATA_PROVIDER)) issues.push({ name: "DATA_PROVIDER", reason: "must be 'memory' or 'prisma'" });
  if (mode === "demo") return { mode, issues };

  // ── production ──
  need("AUTH_SECRET");
  if (env.DATA_PROVIDER !== "prisma") issues.push({ name: "DATA_PROVIDER", reason: "must be 'prisma' in production (the in-memory database is demo-only)" });
  need("DATABASE_URL");
  if (has(env.DATABASE_URL) && !/^postgres(ql)?:\/\//.test(env.DATABASE_URL!)) issues.push({ name: "DATABASE_URL", reason: "must be a postgresql:// URL" });
  need("APP_URL");
  if (has(env.APP_URL) && !isUrl(env.APP_URL, ["https:"])) issues.push({ name: "APP_URL", reason: "must be the public https:// URL of the site" });

  for (const name of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) need(name, "required in production (object storage)");
  if (has(env.S3_ENDPOINT) && !isUrl(env.S3_ENDPOINT, ["https:", "http:"])) issues.push({ name: "S3_ENDPOINT", reason: "must be an http(s) URL" });

  for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"]) need(name, "required in production (e-mail)");
  if (has(env.SMTP_PORT) && !/^\d{2,5}$/.test(env.SMTP_PORT!)) issues.push({ name: "SMTP_PORT", reason: "must be a port number" });
  if (has(env.EMAIL_FROM) && !/^([^<>\r\n]+<)?[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+>?$/.test(env.EMAIL_FROM!.trim())) issues.push({ name: "EMAIL_FROM", reason: "must be an address like no-reply@example.com or Name <no-reply@example.com>" });
  if (has(env.SMTP_SECURE) && !["0", "1"].includes(env.SMTP_SECURE!)) issues.push({ name: "SMTP_SECURE", reason: "must be 0 or 1" });

  need("PAYMENT_SECRET_KEY", "required in production (payments)");
  need("PAYMENT_WEBHOOK_SECRET", "required in production (payment webhooks)");
  if (has(env.PAYMENT_SECRET_KEY) && stripeMode(env.PAYMENT_SECRET_KEY) === "invalid") issues.push({ name: "PAYMENT_SECRET_KEY", reason: "must be a Stripe secret key (sk_test_… or sk_live_…)" });
  if (has(env.PAYMENT_WEBHOOK_SECRET) && !/^whsec_/.test(env.PAYMENT_WEBHOOK_SECRET!)) issues.push({ name: "PAYMENT_WEBHOOK_SECRET", reason: "must be a Stripe webhook signing secret (whsec_…)" });
  if (has(env.STRIPE_API_BASE) && stripeMode(env.PAYMENT_SECRET_KEY) !== "test") issues.push({ name: "STRIPE_API_BASE", reason: "may only be set together with a Stripe TEST key (sk_test_…)" });

  if (env.DEMO_LOGIN === "1") issues.push({ name: "DEMO_LOGIN", reason: "demo logins must be disabled in production" });
  return { mode, issues };
}

/** Throws one readable error listing every problem (names only). A no-op in demo mode unless a value is malformed. */
export function assertEnv(env: Env = process.env): void {
  const { mode, issues } = validateEnv(env);
  if (!issues.length) return;
  const lines = issues.map((i) => `  - ${i.name}: ${i.reason}`).join("\n");
  const message = `Invalid environment (${mode} mode):\n${lines}\nSee docs/DEPLOYMENT_MODES.md.`;
  throw new Error(message); // demo mode only reaches here for a malformed optional value — surface it early too
}
