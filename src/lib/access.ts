import type { PlatformSlug } from "@/types";

/**
 * Content access decision for a platform's learning content. One place to extend when paid access arrives:
 * add a "purchase_required" state (entitlement check) and every page that calls resolveAccess adapts.
 *   login_required       — anonymous visitor
 *   enrollment_required  — signed in, but no access to this platform yet (demo: free enrolment; later: purchase / admin grant)
 *   granted              — can open topics, materials and tests (subject to the usual per-topic unlocking)
 */
export type ContentAccess = "granted" | "login_required" | "enrollment_required";

export interface AccessInput {
  signedIn: boolean;
  enrolledPlatforms: readonly PlatformSlug[];
}

export function resolveAccess(input: AccessInput, platform: PlatformSlug): ContentAccess {
  if (!input.signedIn) return "login_required";
  return input.enrolledPlatforms.includes(platform) ? "granted" : "enrollment_required";
}
