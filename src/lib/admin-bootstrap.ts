/**
 * Decision rules of `npm run admin:create` (pure, so they can be tested without a database).
 *
 *  • no administrator exists yet            → create the FIRST administrator
 *  • the e-mail already belongs to an admin → operator password reset (recovery path; sessions are revoked by the caller)
 *  • the e-mail belongs to a student        → refused unless ADMIN_PROMOTE_EXISTING=1 (never silently turn a learner into staff)
 *  • another administrator already exists   → refused unless ADMIN_ALLOW_ADDITIONAL=1 (further admins are created inside the
 *                                             admin area by an existing, MFA-protected administrator)
 */
export type BootstrapDecision =
  | { action: "create" | "reset" | "promote" }
  | { action: "refuse"; reason: "STUDENT_ACCOUNT" | "ADMIN_EXISTS" };

export function decideAdminBootstrap(input: {
  existing: { role: "ADMIN" | "STUDENT" } | null;
  adminCount: number;
  promoteExisting?: boolean;
  allowAdditional?: boolean;
}): BootstrapDecision {
  if (input.existing?.role === "ADMIN") return { action: "reset" };
  if (input.existing?.role === "STUDENT" && !input.promoteExisting) return { action: "refuse", reason: "STUDENT_ACCOUNT" };
  if (input.adminCount > 0 && !input.allowAdditional) return { action: "refuse", reason: "ADMIN_EXISTS" }; // any further admin needs an explicit flag
  return { action: input.existing ? "promote" : "create" };
}

export const passwordProblem = (password: string): string | null =>
  password.length < 12 ? "at least 12 characters" : !/[A-Za-z]/.test(password) || !/\d/.test(password) ? "letters and digits" : null;
