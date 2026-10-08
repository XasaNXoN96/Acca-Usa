import { json } from "@/lib/api-guards";
import { logEvent } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { services } from "@/services";
import { getPaymentProvider } from "@/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

/**
 * POST /api/webhooks/payments — the ONLY place a payment becomes PAID.
 *  • no session: the caller is the payment provider, authenticated by the signature of the RAW body (HMAC + timestamp window)
 *  • an unsigned / forged / replayed-too-late request is rejected before any parsing or database work
 *  • applying an event is idempotent (provider event id), so the provider's retries are harmless
 *  • demo mode has no webhook: the demo provider cannot verify anything, so this route refuses everything there
 */
export async function POST(req: Request) {
  const provider = getPaymentProvider();
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 64);
  const rl = await rateLimit(`webhook:${ip}`, 300, 60_000);
  if (!rl.ok) return json({ ok: false }, 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ ok: false }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false }, 413);

  const verified = provider.verifyWebhook(raw, req.headers);
  if (!verified.ok) {
    logEvent("warn", "payment.webhook_rejected", { provider: provider.name });
    return json({ ok: false }, 400);
  }
  if (!verified.event) return json({ ok: true, outcome: "ignored" }); // authentic, but not an event we act on

  try {
    const outcome = await services.payments.applyProviderEvent(provider.name, verified.event);
    return json({ ok: true, outcome });
  } catch (e) {
    logEvent("error", "payment.webhook_failed", { provider: provider.name, error: e instanceof Error ? e.name : "unknown" });
    return json({ ok: false }, 500); // the provider retries
  }
}
