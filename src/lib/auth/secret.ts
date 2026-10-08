import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP_MODE } from "@/lib/app-mode";

let cached: Buffer | undefined;

/**
 * Server-only signing secret.
 *  - production mode: AUTH_SECRET (≥32 chars) is mandatory.
 *  - demo mode: a random secret is generated once and kept in the OS temp dir (0600), shared by the
 *    server and the route proxy. It is never in the repo, never sent to the browser, and sessions
 *    die when the temp file is removed.
 */
export function getAuthSecret(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 32) return (cached = Buffer.from(fromEnv));
  if (APP_MODE === "production") throw new Error("AUTH_SECRET (at least 32 characters) is required in production mode.");

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
