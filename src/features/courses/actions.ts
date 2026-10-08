"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { services } from "@/services";
import { sessionOrNull } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";

const platform = z.enum(["acca", "fia"]);

async function originOf(): Promise<string> {
  if (process.env.APP_URL) return serverEnv.appUrl();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type EnrollResult = { ok: true; checkoutUrl?: string } | { ok: false; code?: "REVOKED" | "RATE_LIMITED" | "FAILED" };

/**
 * Free platform → enrolled immediately. Paid platform → a pending payment + the provider's checkout URL; access is NOT
 * granted here, only by the verified payment webhook. The price comes from the database, never from the browser.
 */
export async function enrollAction(raw: unknown): Promise<EnrollResult> {
  const parsed = platform.safeParse(raw);
  const session = await sessionOrNull();
  if (!parsed.success || !session) return { ok: false, code: "FAILED" };

  const res = await services.enrollments.enroll(session.user.id, parsed.data);
  if (res.ok) {
    revalidatePath("/", "layout");
    return { ok: true };
  }
  if (res.code === "ACCESS_REVOKED") return { ok: false, code: "REVOKED" };
  if (res.code !== "PAYMENT_REQUIRED") return { ok: false, code: "FAILED" };

  const rl = await rateLimit(`checkout:${session.user.id}`, 10, 10 * 60_000);
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };
  const checkout = await services.payments.startCheckout({ userId: session.user.id, platform: parsed.data, idempotencyKey: randomUUID(), origin: await originOf() });
  return checkout.ok ? { ok: true, checkoutUrl: checkout.data.checkoutUrl } : { ok: false, code: "FAILED" };
}

export async function leaveAction(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = platform.safeParse(raw);
  const session = await sessionOrNull();
  if (!parsed.success || !session) return { ok: false };
  const res = await services.enrollments.leave(session.user.id, parsed.data);
  revalidatePath("/", "layout");
  return { ok: res.ok };
}
