/**
 * Restores a backup made by `npm run db:backup` into an EMPTY database and verifies the result.
 *
 *   BACKUP_FILE=/secure/backups/acca-….dump[.enc] RESTORE_TARGET_URL=postgresql://…/acca_restore_test \
 *     [BACKUP_PASSPHRASE=…] [AUTH_SECRET=… (to verify the audit chain)] npm run db:restore
 *
 * Safety rules (not options):
 *  • there is NO overwrite / drop / clean mode: the target must already exist and contain no tables at all, so a live database
 *    (production included) can never be restored over. Recovery = restore into a NEW database, verify, then switch DATABASE_URL.
 *  • the dump is only used if its SHA-256 equals the manifest; an encrypted dump must authenticate (wrong passphrase / tampering fails)
 *  • the restore runs in a single transaction (all or nothing)
 * Exit codes: 0 restored AND verified · 1 usage · 3 backup rejected · 4 target not empty / not allowed · 5 verification failed · 6 restore failed
 */
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GENESIS_HASH, verifyChain } from "../src/lib/audit-chain";
import { toAuditRec } from "../src/lib/audit-store";
import { cliChainKey } from "./lib/cli-audit";
import { decryptFile, isEncrypted, parsePgUrl, pgEnv, run, sha256File, type Manifest } from "./lib/pg-tools";

const file = process.env.BACKUP_FILE;
const targetUrl = process.env.RESTORE_TARGET_URL;
if (!file || !targetUrl) { console.error("Set BACKUP_FILE and RESTORE_TARGET_URL (an existing, EMPTY database)."); process.exit(1); }

const die = (code: number, msg: string): never => { console.error(msg); process.exit(code); };

async function main() {
  let manifest: Manifest;
  try { manifest = JSON.parse(readFileSync(`${file}.manifest.json`, "utf8")) as Manifest; } catch { return die(3, `Manifest ${file}.manifest.json is missing or unreadable — refusing to restore an unverifiable backup.`); }
  if (manifest.format !== 1) die(3, "Unknown manifest format.");
  const actual = await sha256File(file!).catch(() => null);
  if (!actual) die(3, "Backup file cannot be read.");
  if (actual !== manifest.file.sha256) die(3, `Checksum mismatch: the backup file was modified or damaged (expected ${manifest.file.sha256.slice(0, 12)}…, got ${actual!.slice(0, 12)}…). Not restoring.`);
  console.log("✓ checksum matches the manifest");

  const target = parsePgUrl(targetUrl!);
  const env = pgEnv(target);
  const live = process.env.DATABASE_URL ? (() => { try { return parsePgUrl(process.env.DATABASE_URL!); } catch { return null; } })() : null;
  if (live && live.host === target.host && live.port === target.port && live.database === target.database) die(4, "Refusing: RESTORE_TARGET_URL is the same database as DATABASE_URL (the live one). Restore into a NEW database.");
  const prisma = new PrismaClient({ datasources: { db: { url: targetUrl! } } });
  const tmp = mkdtempSync(join(tmpdir(), "acca-restore-"));
  try {
    const existing = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`;
    if (Number(existing[0]!.n) !== 0) return die(4, `Refusing: the target database "${target.database}" is not empty (${existing[0]!.n} tables). This tool never overwrites or cleans a database.`);

    let dump = file!;
    if (manifest.file.encrypted || isEncrypted(file!)) {
      const pass = process.env.BACKUP_PASSPHRASE;
      if (!pass) return die(3, "This backup is encrypted: set BACKUP_PASSPHRASE.");
      dump = join(tmp, "plain.dump");
      try { await decryptFile(file!, dump, pass); } catch { return die(3, "Cannot decrypt: wrong passphrase or the backup was tampered with."); }
      console.log("✓ decrypted and authenticated");
    }

    const r = run("pg_restore", ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges", "--dbname", target.database, dump], env);
    if (r.status !== 0) return die(6, `pg_restore failed (exit ${r.status}); the transaction was rolled back, the target is still empty.\n${r.stderr.trim().slice(0, 600)}`);
    console.log("✓ pg_restore completed (single transaction)");

    // ── verification against the RESTORED database
    const problems: string[] = [];
    const notes: string[] = [];
    const tables = (await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`).map((t) => t.tablename);
    const missing = Object.keys(manifest.tables).filter((t) => !tables.includes(t));
    if (missing.length) problems.push(`tables missing after restore: ${missing.join(", ")}`);
    const drift: string[] = [];
    for (const t of Object.keys(manifest.tables).filter((x) => tables.includes(x))) {
      const n = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${t}"`))[0]!.n);
      // the manifest was counted right after the dump, so rows written in between make the manifest slightly larger — never smaller
      if (n > manifest.tables[t]!) problems.push(`${t}: ${n} rows restored but the manifest only knows ${manifest.tables[t]}`);
      else if (n < manifest.tables[t]!) drift.push(`${t} ${n}/${manifest.tables[t]}`);
    }
    if (drift.length) notes.push(`rows written between the dump and the manifest count are not in the backup (normal on a live system): ${drift.join(", ")}`);
    const migs = (await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`).map((m) => m.migration_name);
    if (JSON.stringify(migs) !== JSON.stringify(manifest.migrations)) problems.push("applied migrations differ from the manifest");
    const onDisk = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const pending = onDisk.filter((m) => !migs.includes(m)), unknown = migs.filter((m) => !onDisk.includes(m));
    if (unknown.length) problems.push(`the backup has migrations this code does not know (newer app version needed): ${unknown.join(", ")}`);
    if (pending.length) notes.push(`this code has ${pending.length} migration(s) newer than the backup — run \`npx prisma migrate deploy\` against the restored database before using it`);

    const triggers = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_trigger WHERE tgrelid = '"AuditEvent"'::regclass AND NOT tgisinternal`;
    if (Number(triggers[0]!.n) < 2) problems.push("audit log protection triggers did not survive the restore");
    const dangling = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "Enrollment" e LEFT JOIN "User" u ON u.id = e."userId" WHERE u.id IS NULL`;
    if (Number(dangling[0]!.n) !== 0) problems.push("enrollments without a user (referential integrity)");

    const key = cliChainKey();
    if (!key) notes.push("audit chain NOT VERIFIED: AUTH_SECRET / AUDIT_CHAIN_SECRET not provided to this command");
    else {
      const rows = await prisma.auditEvent.findMany({ orderBy: { seq: "asc" } });
      const v = verifyChain(key, rows.map(toAuditRec), GENESIS_HASH);
      if (!v.ok) problems.push(`audit chain broken at ${v.badId} (${v.reason})`);
      else notes.push(`audit chain verified (${v.checked} events)`);
      if (v.ok && manifest.audit.head && rows.length >= manifest.audit.events && !rows.some((r) => r.hash === manifest.audit.head)) problems.push("the audit head recorded in the manifest is not in the restored log");
    }

    for (const n of notes) console.log(`• ${n}`);
    if (problems.length) {
      console.error(`✗ VERIFICATION FAILED:\n  - ${problems.join("\n  - ")}`);
      process.exit(5);
    }
    console.log(`✓ verified: ${tables.length} tables, ${migs.length} migrations, row counts, triggers, referential check.\nRestore of ${manifest.file.name} into "${target.database}" is complete and verified. Point DATABASE_URL at it only after your own acceptance checks.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(6); });
