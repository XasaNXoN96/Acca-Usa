"use server";

import { z } from "zod";
import { sessionOrNull } from "@/lib/auth/guards";
import { services } from "@/services";
import type { PracticeCheck } from "@/types";

export type CheckResult = { ok: true; check: PracticeCheck } | { ok: false; code: "FORBIDDEN" | "INVALID" | "FAILED" };

/** Grades one practice answer for the signed-in STUDENT. Only questions they got wrong earlier can be checked. */
export async function checkPracticeAction(raw: unknown): Promise<CheckResult> {
  const parsed = z.object({ questionId: z.string().min(1).max(120), optionId: z.string().min(1).max(60) }).safeParse(raw);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const session = await sessionOrNull();
  if (!session || session.user.role !== "STUDENT") return { ok: false, code: "FORBIDDEN" };
  const res = await services.mistakes.checkPractice(session.user.id, parsed.data.questionId, parsed.data.optionId);
  if (res.ok) return { ok: true, check: res.data };
  return { ok: false, code: res.code === "NOT_FOUND" ? "FORBIDDEN" : res.code === "INVALID" ? "INVALID" : "FAILED" };
}
