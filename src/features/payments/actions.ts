"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { sessionOrNull } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/app-mode";

const schema = z.object({ paymentId: z.string().min(8).max(80), outcome: z.enum(["paid", "failed", "cancelled"]) });

/** DEMO only: finishes a simulated checkout for the SIGNED-IN user's own payment. Refused outright in production. */
export async function completeDemoCheckoutAction(input: unknown): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse(input);
  const session = await sessionOrNull();
  if (!isDemoMode || !parsed.success || !session) return { ok: false };
  const res = await services.payments.completeDemoCheckout({ userId: session.user.id, ...parsed.data });
  revalidatePath("/", "layout");
  return { ok: res.ok };
}
