import type { Role } from "@/types";

/**
 * Role/permission matrix. UI may use it to hide controls, but it is NOT a
 * security boundary: every server action / route handler must re-check with
 * `assertCan` once Auth.js is connected.
 */
export type Permission =
  | "learn"
  | "manage_content"
  | "manage_tests"
  | "view_students"
  | "manage_students"
  | "manage_payments"
  | "view_statistics"
  | "manage_settings";

const matrix: Record<Role, readonly Permission[]> = {
  STUDENT: ["learn"],
  ADMIN: [
    "learn",
    "manage_content",
    "manage_tests",
    "view_students",
    "manage_students",
    "manage_payments",
    "view_statistics",
    "manage_settings",
  ],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  return role ? matrix[role].includes(permission) : false;
}

export function assertCan(role: Role | undefined, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error("FORBIDDEN");
  }
}

export function isStaff(role: Role | undefined) {
  return role === "ADMIN";
}
