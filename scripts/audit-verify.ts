/**
 * Verifies the whole audit chain in the database (keyed hashes + links from the genesis row).
 *
 *   AUTH_SECRET=… DATABASE_URL=… npm run audit:verify          exit 0 = intact, exit 2 = broken, exit 1 = cannot verify
 */
import { PrismaClient } from "@prisma/client";
import { GENESIS_HASH, verifyChain } from "../src/lib/audit-chain";
import { toAuditRec } from "../src/lib/audit-store";
import { cliChainKey } from "./lib/cli-audit";

const key = cliChainKey();
if (!key) {
  console.error("Set AUTH_SECRET (or AUDIT_CHAIN_SECRET) to the value the application uses — without the key the chain cannot be verified.");
  process.exit(1);
}
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.auditEvent.findMany({ orderBy: { seq: "asc" } });
  const res = verifyChain(key!, rows.map(toAuditRec), GENESIS_HASH);
  if (res.ok) console.log(`Audit chain intact: ${res.checked} events.`);
  else {
    console.error(`AUDIT CHAIN BROKEN at event ${res.badId} (${res.reason === "HASH" ? "content or hash changed" : "missing / re-ordered predecessor"}); ${res.checked} events before it verified.`);
    process.exitCode = 2;
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
