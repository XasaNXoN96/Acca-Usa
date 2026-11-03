import { json } from "@/lib/api-guards";
import { logEvent } from "@/lib/log";
import { paymentsMode } from "@/lib/payments-mode";
import { rateLimit } from "@/lib/rate-limit";
import { services } from "@/services";
import { handlePayme } from "@/services/payments/payme-rpc";
import { paymeStore } from "@/services/prisma/payme-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;

/**
 * POST /api/payments/payme — the Payme Merchant API endpoint (JSON-RPC). Register this URL in the Payme business cabinet.
 * Exists only with PAYMENTS_PROVIDER=payme (404 otherwise). Authenticated by HTTP Basic `Paycom:<PAYME_KEY>`; protocol answers always
 * use HTTP 200 (errors are JSON-RPC error objects), a real failure on our side answers 500 so that Payme retries.
 */
export async function POST(req: Request) {
  if (paymentsMode() !== "payme") return json({ ok: false }, 404);
  const key = process.env.PAYME_KEY ?? "";
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 64);
  if (!(await rateLimit(`payme:${ip}`, 600, 60_000)).ok) return json({ ok: false }, 429);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ ok: false }, 413);
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false }, 413);
  try {
    const out = await handlePayme(
      { authorization: req.headers.get("authorization"), body },
      { store: paymeStore, key, apply: (event) => services.payments.applyProviderEvent("payme", event) },
    );
    return json(out.body, 200);
  } catch (e) {
    logEvent("error", "payment.payme_failed", { error: e instanceof Error ? e.name : "unknown" });
    return json({ ok: false }, 500);
  }
}
