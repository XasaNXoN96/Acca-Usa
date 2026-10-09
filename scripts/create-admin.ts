/**
 * Creates the FIRST administrator of a production database (no demo account exists in production, and there is no public
 * way to become an administrator: registration only ever creates students).
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_NAME="Owner" ADMIN_PASSWORD='…' DATABASE_URL=… npm run admin:create
 *
 * Rules (see src/lib/admin-bootstrap.ts):
 *   first administrator            → created
 *   same e-mail as an administrator → operator password reset (all that admin's sessions are revoked)
 *   e-mail of a student            → refused unless ADMIN_PROMOTE_EXISTING=1
 *   another administrator exists   → refused unless ADMIN_ALLOW_ADDITIONAL=1 (create further admins in the admin area instead)
 *
 * The password is read from the environment (never argv → not in shell history / process lists), hashed with scrypt and never printed.
 * In production the administrator must enrol two-factor authentication at the first sign-in (Admin → Security).
 */
import { PrismaClient } from "@prisma/client";
import { cliAudit } from "./lib/cli-audit";
import { decideAdminBootstrap, passwordProblem } from "../src/lib/admin-bootstrap";
import { hashPassword } from "../src/lib/auth/password";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || "Administrator";
const password = process.env.ADMIN_PASSWORD;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password) {
  console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD (and optionally ADMIN_NAME).");
  process.exit(1);
}
const weak = passwordProblem(password);
if (weak) {
  console.error(`ADMIN_PASSWORD must contain ${weak}.`);
  process.exit(1);
}

const adminEmail: string = email;
const adminPassword: string = password;
const prisma = new PrismaClient();
async function main() {
  const [existing, adminCount] = await Promise.all([
    prisma.user.findUnique({ where: { email: adminEmail }, select: { role: true, deletedAt: true } }),
    prisma.user.count({ where: { role: "ADMIN", deletedAt: null } }),
  ]);
  const decision = decideAdminBootstrap({
    existing: existing && !existing.deletedAt ? { role: existing.role } : null, adminCount,
    promoteExisting: process.env.ADMIN_PROMOTE_EXISTING === "1", allowAdditional: process.env.ADMIN_ALLOW_ADDITIONAL === "1",
  });
  if (decision.action === "refuse") {
    console.error(decision.reason === "STUDENT_ACCOUNT"
      ? "Refused: this e-mail belongs to a student account. Set ADMIN_PROMOTE_EXISTING=1 to promote it deliberately."
      : "Refused: an administrator already exists. Create further administrators in the admin area, or set ADMIN_ALLOW_ADDITIONAL=1.");
    process.exit(3);
  }
  const passwordHash = await hashPassword(adminPassword);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name, passwordHash, role: "ADMIN", status: "active" },
    update: { name, passwordHash, role: "ADMIN", status: "active", deletedAt: null, tokenVersion: { increment: 1 } },
  });
  await cliAudit(prisma, { action: `admin.${decision.action === "create" ? "created" : decision.action === "reset" ? "password_reset" : "promoted"}`, target: { type: "user", id: user.id }, meta: { adminEmail: user.email } });
  console.log(`Administrator ${decision.action === "create" ? "created" : decision.action === "reset" ? "password reset" : "promoted"}: ${user.email}`);
  console.log("Sign in at /login; in production you will be asked to set up two-factor authentication first.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
