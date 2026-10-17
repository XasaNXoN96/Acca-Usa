import { json } from "@/lib/api-guards";
import { DATA_PROVIDER } from "@/lib/data-provider";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for load balancers, uptime monitors and systemd/Nginx probes. No authentication, no secrets, no details.
 *   GET /api/health          liveness  — the Node process answers                 → 200 {"ok":true}
 *   GET /api/health?ready=1  readiness — and the database answers `SELECT 1`      → 200, or 503 {"ok":false}
 * It never reports versions, hostnames, table names or error text.
 */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("ready") !== "1" || DATA_PROVIDER !== "prisma") return json({ ok: true });
  try {
    await Promise.race([getPrisma().$queryRaw`SELECT 1`, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000).unref())]);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
