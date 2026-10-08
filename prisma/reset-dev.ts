/**
 * Empties every application table of a LOCAL development database so `prisma/seed.ts` can reload the demo data
 * (used by the smoke runner between suites). Refuses anything that is not a local database or that runs in production.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_APP_MODE === "production" || !["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error("reset-dev refuses to run: it only empties a LOCAL development database (non-production).");
  process.exit(1);
}

const prisma = new PrismaClient();
async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
