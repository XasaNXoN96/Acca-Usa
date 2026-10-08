/**
 * Creates (or promotes) the first administrator of a production database. No demo account exists in production.
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_NAME="Owner" ADMIN_PASSWORD='…' DATABASE_URL=… npm run admin:create
 *
 * The password is read from the environment (never from argv, so it stays out of shell history / process lists),
 * hashed with scrypt, and never printed.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || "Administrator";
const password = process.env.ADMIN_PASSWORD;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password) {
  console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD (and optionally ADMIN_NAME).");
  process.exit(1);
}
if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("ADMIN_PASSWORD must be at least 12 characters and contain letters and digits.");
  process.exit(1);
}

const adminEmail: string = email;
const adminPassword: string = password;
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await hashPassword(adminPassword);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name, passwordHash, role: "ADMIN", status: "active" },
    update: { name, passwordHash, role: "ADMIN", status: "active", deletedAt: null, tokenVersion: { increment: 1 } },
  });
  console.log(`Administrator ready: ${user.email}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
