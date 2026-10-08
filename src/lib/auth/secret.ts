import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_MODE } from "@/lib/app-mode";

let cached: Buffer | undefined;

/**
 * Serverless platforms (Vercel, AWS Lambda) run the proxy and every route/action in SEPARATE function
 * instances, each with its own empty /tmp. A per-instance random secret therefore makes every cookie
 * signed by one instance invalid in the next — login "succeeds" and is immediately bounced back to /login.
 * Instead, derive the demo secret from identifiers that are identical for every instance of one deployment.
 */
const serverlessSeed = () => {
  if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.NOW_REGION) return null;
  const parts = [
    process.env.VERCEL_DEPLOYMENT_ID, process.env.VERCEL_PROJECT_ID, process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.VERCEL_URL, process.env.AWS_LAMBDA_FUNCTION_NAME,
  ].filter(Boolean);
  return parts.join("|") || "serverless-demo";
};

/**
 * Server-only signing secret.
 *  - AUTH_SECRET (≥32 chars) always wins. Mandatory in production mode. RECOMMENDED on Vercel demos too.
 *  - demo mode on a serverless platform: HMAC derived from the per-deployment identifiers above, so all
 *    instances agree without any shared storage. Those ids are not secret — acceptable ONLY because demo
 *    mode serves fictional data with publicly listed credentials; set AUTH_SECRET for anything stronger.
 *  - demo mode on a long-lived server: a random secret kept once in the OS temp dir (0600), shared by the
 *    server and the route proxy. Never in the repo, never sent to the browser.
 */
export function getAuthSecret(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) return (cached = Buffer.from(fromEnv));
  if (APP_MODE === "production") throw new Error("AUTH_SECRET (at least 32 characters) is required in production mode.");

  const seed = serverlessSeed();
  if (seed) return (cached = createHmac("sha256", "acca-usa:demo-session:v1").update(seed).digest());

  const dir = join(tmpdir(), "acca-usa-demo");
  const file = join(dir, "auth-secret");
  try {
    return (cached = readFileSync(file));
  } catch {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const secret = randomBytes(48);
    try {
      writeFileSync(file, secret, { flag: "wx", mode: 0o600 });
      return (cached = secret);
    } catch {
      return (cached = readFileSync(file)); // another process won the race
    }
  }
}
