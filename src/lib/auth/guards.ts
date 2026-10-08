import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@/types";
import { routes } from "@/lib/routes";
import { getSession } from "./session";
import type { Session } from "@/services";

export const ANY_ROLE: readonly Role[] = ["STUDENT", "TEACHER", "ADMIN"];
export const STAFF_ROLES: readonly Role[] = ["TEACHER", "ADMIN"];

/**
 * Server-side route guard — the authority (the proxy is only a fast pre-check).
 * Use at the top of every protected layout, page and server action.
 */
export async function requireSession(roles: readonly Role[] = ANY_ROLE): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(routes.login);
  if (!roles.includes(session.user.role)) redirect(session.user.role === "STUDENT" ? routes.dashboard : routes.admin);
  return session;
}

/** For server actions: returns null instead of redirecting so the action can answer with an error. */
export async function sessionOrNull(roles: readonly Role[] = ANY_ROLE): Promise<Session | null> {
  const session = await getSession();
  return session && roles.includes(session.user.role) ? session : null;
}

export function homeFor(role: Role): string {
  return role === "STUDENT" ? routes.dashboard : routes.admin;
}
