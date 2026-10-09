import { APP_MODE } from "@/lib/app-mode";
import type { Role } from "@/types";

/**
 * Administrators must use a second factor in production mode (or whenever MFA_REQUIRED=1). Demo mode keeps the seeded demo
 * admin usable without it, but an administrator who HAS enrolled is always challenged — in every mode.
 */
export const mfaRequiredFor = (role: Role): boolean => role === "ADMIN" && (APP_MODE === "production" || process.env.MFA_REQUIRED === "1");
