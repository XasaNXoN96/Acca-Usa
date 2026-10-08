/**
 * PRODUCTION bootstrap: the fixed structure the application is built around — the ACCA and FIA platforms and their levels.
 * No demo users, no demo content, no payments. Idempotent (existing rows are left untouched; prices stay as admins set them).
 * Subjects, topics, materials and tests are created by administrators; the first administrator with `npm run admin:create`.
 *
 *   DATABASE_URL=… npm run db:bootstrap
 */
import { PrismaClient } from "@prisma/client";
import { platforms } from "../src/data/mock/catalog";

const prisma = new PrismaClient();

async function main() {
  await prisma.platform.createMany({ data: platforms.map((p) => ({ slug: p.slug, name: p.name, fullName: p.fullName, priceCents: 0 })), skipDuplicates: true });
  await prisma.level.createMany({ data: platforms.flatMap((p) => p.levels.map((l) => ({ id: l.id, platformSlug: p.slug, name: l.name, order: l.order }))), skipDuplicates: true });
  process.stdout.write(`Bootstrap complete: ${platforms.map((p) => p.name).join(", ")}.\n`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
