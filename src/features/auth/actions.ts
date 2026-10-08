"use server";

import { loginSchema, registerSchema } from "@/lib/validators/auth";

/**
 * STUB. Validates on the server (the browser is never trusted) and reports that auth is
 * not connected. No credentials are read, stored or compared. Replaced by Auth.js
 * `signIn` / a registration service in the backend block.
 */
export type AuthActionResult = { ok: false; code: "INVALID" | "NOT_CONNECTED" };

export async function loginAction(input: unknown): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  return { ok: false, code: "NOT_CONNECTED" };
}

export async function registerAction(input: unknown): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  return { ok: false, code: "NOT_CONNECTED" };
}
