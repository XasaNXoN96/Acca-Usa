/**
 * Break-glass: removes the second factor of ONE administrator and revokes all of that account's sessions.
 *
 *   ADMIN_EMAIL=owner@example.com DATABASE_URL=… npm run admin:mfa-reset
 *
 * Needs direct database access (an operator action — there is deliberately no web route that can disable MFA without a
 * valid second factor). The administrator must enrol a new authenticator at the next sign-in when MFA is mandatory.
 */
import { PrismaClient } from "@prisma/client";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!email) {
  console.error("Set ADMIN_EMAIL to the administrator whose second factor must be reset.");
  process.exit(1);
}
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { email: email! } });
  if (!user || user.role !== "ADMIN" || user.deletedAt) {
    console.error("No active administrator with that e-mail.");
    process.exitCode = 1;
    return;
  }
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null, tokenVersion: { increment: 1 } } }),
  ]);
  console.log(`Second factor removed for ${email}; all sessions revoked.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
