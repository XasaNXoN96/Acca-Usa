import "server-only";
import { DATA_PROVIDER } from "@/lib/data-provider";
import { getPrisma } from "@/lib/prisma";

/**
 * Fixed-window limiter for auth / upload / webhook endpoints.
 *  • DATA_PROVIDER=prisma  one atomic upsert on the shared `RateLimit` table → correct across every instance
 *  • DATA_PROVIDER=memory  per-process Map (demo, single instance)
 */
export interface RateLimitResult { ok: boolean; retryAfterSeconds: number }

const hits = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return { ok: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  return { ok: entry.count <= limit, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
}

async function databaseLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const next = new Date(Date.now() + windowMs);
  const rows = await getPrisma().$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${next})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN ${next} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0];
  if (!row) return { ok: true, retryAfterSeconds: 0 };
  return { ok: row.count <= limit, retryAfterSeconds: row.count <= limit ? 0 : Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (DATA_PROVIDER !== "prisma") return memoryLimit(key, limit, windowMs);
  try {
    return await databaseLimit(key, limit, windowMs);
  } catch {
    // A limiter outage must not turn into an open door for credential stuffing: fall back to the local counter.
    return memoryLimit(key, limit, windowMs);
  }
}
