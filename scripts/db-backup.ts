/**
 * Logical PostgreSQL backup (pg_dump custom format) + manifest (checksum, migrations, row counts, audit head).
 *
 *   DATABASE_URL=… BACKUP_DIR=/secure/backups [BACKUP_PASSPHRASE=…] [BACKUP_KEEP=14] npm run db:backup
 *
 * • read-only against the database (pg_dump takes a consistent snapshot; nothing is modified, no locks that block writers)
 * • credentials go to pg_dump through libpq environment variables, never through argv
 * • with BACKUP_PASSPHRASE the dump is encrypted at rest (AES-256-GCM); without it the file is plaintext and contains personal data
 * • BACKUP_KEEP=N removes older acca-*.dump* files in BACKUP_DIR (only files this tool names itself); unset = never delete
 * Stores the DATABASE only — uploaded files live in object storage and need that provider's own versioning / replication.
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { encryptFile, parsePgUrl, pgEnv, run, sha256File, type Manifest } from "./lib/pg-tools";
import { cliAudit } from "./lib/cli-audit";

const url = process.env.DATABASE_URL;
const dir = process.env.BACKUP_DIR;
if (!url || !dir) { console.error("Set DATABASE_URL and BACKUP_DIR."); process.exit(1); }
const pass = process.env.BACKUP_PASSPHRASE || undefined;
if (pass && pass.length < 16) { console.error("BACKUP_PASSPHRASE must be at least 16 characters."); process.exit(1); }

async function main() {
  const target = parsePgUrl(url!);
  const env = pgEnv(target);
  const prisma = new PrismaClient();
  try {
    mkdirSync(dir!, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(dir!, `acca-${stamp}.dump`);
    const raw = `${base}.partial`;

    // 1) facts about the database, read in the SAME snapshot window as far as possible (dump is the source of truth; counts are re-checked on restore)
    const version = (await prisma.$queryRaw<{ version: string }[]>`SELECT current_setting('server_version') AS version`)[0]?.version ?? "unknown";
    const tableNames = (await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`).map((t) => t.tablename);
    const migrations = (await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`).map((m) => m.migration_name);

    // 2) the dump itself
    const dumpVersion = run("pg_dump", ["--version"], env).stdout.trim();
    const d = run("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--file", raw], env);
    if (d.status !== 0) { rmSync(raw, { force: true }); console.error(`pg_dump failed (exit ${d.status}): ${d.stderr.trim().slice(0, 500)}`); process.exitCode = 2; return; }

    // 3) counts AFTER the dump — a backup taken during writes may legitimately be a little older than these; restore verification
    //    therefore recounts from the dump itself (see db-restore). The manifest counts are informational for the operator.
    const tables: Record<string, number> = {};
    for (const t of tableNames) tables[t] = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${t}"`))[0]!.n);
    const head = await prisma.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });

    // 4) optional encryption, then the final name appears atomically
    let finalPath = base;
    if (pass) { finalPath = `${base}.enc`; await encryptFile(raw, finalPath, pass); rmSync(raw); } else renameSync(raw, finalPath);
    chmodSync(finalPath, 0o600);
    const manifest: Manifest = {
      format: 1, createdAt: new Date().toISOString(), database: target.database, serverVersion: version, pgDump: dumpVersion, migrations, tables,
      audit: { events: tables["AuditEvent"] ?? 0, head: head?.hash ?? null },
      file: { name: finalPath.split("/").pop()!, bytes: statSync(finalPath).size, sha256: await sha256File(finalPath), encrypted: !!pass },
    };
    writeFileSync(`${finalPath}.manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });

    if (process.env.BACKUP_KEEP) {
      const keep = Math.max(Number.parseInt(process.env.BACKUP_KEEP, 10) || 0, 1);
      const old = readdirSync(dir!).filter((f) => /^acca-[0-9T-]+Z\.dump(\.enc)?$/.test(f)).sort().slice(0, -keep);
      for (const f of old) { rmSync(join(dir!, f), { force: true }); rmSync(join(dir!, `${f}.manifest.json`), { force: true }); }
      if (old.length) console.log(`Retention: removed ${old.length} older backup(s), kept ${keep}.`);
    }
    await cliAudit(prisma, { action: "backup.created", target: { type: "database", id: target.database }, meta: { file: manifest.file.name, bytes: manifest.file.bytes, encrypted: manifest.file.encrypted } });
    console.log(`Backup written: ${finalPath}\n  size ${manifest.file.bytes} bytes, sha256 ${manifest.file.sha256}\n  encrypted: ${manifest.file.encrypted ? "yes (AES-256-GCM)" : "NO — plaintext, protect the directory"}\n  ${migrations.length} migrations, ${Object.keys(tables).length} tables, ${manifest.audit.events} audit events\nNot restore-tested yet: run  npm run db:restore  into an empty scratch database to verify it.`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
