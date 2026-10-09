/**
 * End-to-end proof that a backup can really be restored — against a throw-away local PostgreSQL (never a production database).
 *   PG_ADMIN_URL=postgresql://postgres:postgres@localhost:5433/postgres npm run test:backup
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { deriveChainKey } from "../src/lib/audit-chain";
import { appendAuditEvent } from "../src/lib/audit-store";
import { verifyPassword } from "../src/lib/auth/password";

const ADMIN_URL = process.env.PG_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:5433/postgres";
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(ADMIN_URL).hostname)) { console.error("test:backup only runs against a LOCAL PostgreSQL."); process.exit(1); }
const suffix = `${process.pid}_${Date.now() % 100000}`;
const dbUrl = (name: string) => ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
const names = { src: `acca_bk_src_${suffix}`, a: `acca_bk_a_${suffix}`, b: `acca_bk_b_${suffix}`, c: `acca_bk_c_${suffix}`, d: `acca_bk_d_${suffix}`, e: `acca_bk_e_${suffix}`, f: `acca_bk_f_${suffix}`, g: `acca_bk_g_${suffix}`, h: `acca_bk_h_${suffix}` };
const AUTH_SECRET = randomBytes(48).toString("base64");
const PASS = "backup-passphrase-0123456789";
const dir = mkdtempSync(join(tmpdir(), "acca-bk-test-"));

const sh = (cmd: string, args: string[], env: Record<string, string> = {}) => {
  const r = spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: "utf8" });
  return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` };
};
const psqlAdmin = (sql: string) => { const r = sh("psql", [ADMIN_URL, "-v", "ON_ERROR_STOP=1", "-c", sql]); if (r.code !== 0) throw new Error(r.out); };
const backup = (env: Record<string, string> = {}) => sh("npx", ["tsx", "scripts/db-backup.ts"], { DATABASE_URL: dbUrl(names.src), BACKUP_DIR: dir, AUTH_SECRET, ...env });
const restore = (file: string, target: string, env: Record<string, string> = {}) => sh("npx", ["tsx", "scripts/db-restore.ts"], { BACKUP_FILE: file, RESTORE_TARGET_URL: dbUrl(target), DATABASE_URL: dbUrl(names.src), AUTH_SECRET, ...env });
const latest = (ext: string) => join(dir, readdirSync(dir).filter((f) => f.startsWith(`acca-${new Date().getUTCFullYear()}`) && f.endsWith(ext)).sort().at(-1)!);
const client = (name: string) => new PrismaClient({ datasources: { db: { url: dbUrl(name) } } });
const counts = async (p: PrismaClient) => {
  const tables = (await p.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`).map((t) => t.tablename);
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = Number((await p.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${t}"`))[0]!.n);
  return out;
};
const tableCount = async (name: string) => { const p = client(name); try { return Number((await p.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_tables WHERE schemaname = 'public'`)[0]!.n); } finally { await p.$disconnect(); } };

const results: [string, boolean][] = [];
const step = async (n: string, f: () => Promise<void>) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String((e as Error).message).split("\n").slice(0, 4).join("\n      ")); } };

async function main() {
  for (const n of Object.values(names)) psqlAdmin(`CREATE DATABASE ${n}`);
  const deploy = sh("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: dbUrl(names.src) }); assert.equal(deploy.code, 0, deploy.out);
  const seed = sh("npx", ["tsx", "prisma/seed.ts"], { DATABASE_URL: dbUrl(names.src) }); assert.equal(seed.code, 0, seed.out);
  const src = client(names.src);
  const key = deriveChainKey(AUTH_SECRET);
  for (let i = 0; i < 12; i++) await appendAuditEvent(src, key, { actor: { type: "admin", id: "u", email: "admin@example.com" }, action: "tests.publish", target: { type: "tests", id: `t${i}` } });
  const atBackup = await counts(src);

  let plain = "";
  await step("1 backup: a consistent custom-format dump + manifest (checksum, migrations, counts, audit head); private file mode; no credentials in the output", async () => {
    const b = backup(); assert.equal(b.code, 0, b.out);
    plain = latest(".dump");
    const m = JSON.parse(readFileSync(`${plain}.manifest.json`, "utf8"));
    assert.equal(m.file.sha256, createHash("sha256").update(readFileSync(plain)).digest("hex"), "manifest checksum");
    assert.equal(m.file.encrypted, false); assert.ok(m.migrations.length >= 10 && m.tables.User > 0 && m.audit.events >= 12 && m.audit.head);
    assert.equal(statSync(plain).mode & 0o077, 0, "backup file must not be group/world readable");
    assert.ok(!b.out.includes("postgres:postgres") && !readFileSync(`${plain}.manifest.json`, "utf8").includes("postgres:postgres"), "credentials leaked");
    assert.match(b.out, /Not restore-tested yet/, "a backup must not claim to be verified before a restore test");
    assert.ok(readFileSync(plain).subarray(0, 5).toString() === "PGDMP", "pg_dump custom format");
  });

  // change the live database AFTER the backup: the restore must bring back the OLD state
  assert.ok(atBackup["Notification"]! > 0 && atBackup["Activity"]! > 0, "seed should contain notifications and activity");
  await src.notification.deleteMany({}); await src.activity.deleteMany({});
  await appendAuditEvent(src, key, { actor: { type: "admin", id: "u" }, action: "after.backup" });

  await step("2 restore into an EMPTY database: all data of the backup is back (not the later changes), and the tool verifies it", async () => {
    const r = restore(plain, names.a); assert.equal(r.code, 0, r.out);
    assert.match(r.out, /checksum matches/); assert.match(r.out, /verified/); assert.match(r.out, /audit chain verified \(12 events\)/);
    const a = client(names.a); try {
      assert.deepEqual(await counts(a), atBackup, "row counts of the restored database equal the state at backup time");
      assert.ok((await a.notification.count()) === atBackup["Notification"] && (await a.activity.count()) === atBackup["Activity"], "rows deleted after the backup are back");
      assert.ok((await a.notification.count()) === atBackup["Notification"] && (await a.activity.count()) === atBackup["Activity"], "rows deleted after the backup are back");
      const back = await a.user.findFirstOrThrow({ where: { email: "student@example.com" } });
      assert.ok(await verifyPassword("Student-Demo1", back.passwordHash), "restored password hash still verifies");
      assert.equal((await a.auditEvent.count({ where: { action: "after.backup" } })), 0, "changes made after the backup must not appear");
      await assert.rejects(() => a.auditEvent.deleteMany({}), /append-only/, "audit protection survives a restore");
      const seq = await a.auditEvent.create({ data: { id: "probe", at: new Date(), actorType: "system", action: "probe", outcome: "success", prevHash: "x", hash: "probe-hash" } });
      assert.ok(seq.seq > 12, "sequence continues after the restored rows");
    } finally { await a.$disconnect(); }
  });
  await step("3 restore refuses a database that already has tables — including the live one — and leaves it untouched", async () => {
    const before = await counts(src);
    const r = restore(plain, names.src); assert.equal(r.code, 4, r.out); assert.match(r.out, /Refusing/);
    assert.deepEqual(await counts(src), before, "live database changed");
    const nonEmpty = restore(plain, names.a); assert.equal(nonEmpty.code, 4, nonEmpty.out);
  });
  await step("4 a modified backup is rejected before anything is restored (checksum), a missing manifest too; the target stays empty", async () => {
    const bad = join(dir, "acca-2000-01-01T00-00-00-000Z.dump"); copyFileSync(plain, bad); copyFileSync(`${plain}.manifest.json`, `${bad}.manifest.json`);
    const buf = readFileSync(bad); const at = Math.floor(buf.length / 2); buf.writeUInt8(buf.readUInt8(at) ^ 0xff, at); writeFileSync(bad, buf);
    const r = restore(bad, names.b); assert.equal(r.code, 3, r.out); assert.match(r.out, /Checksum mismatch/);
    const noMan = join(dir, "orphan.dump"); copyFileSync(plain, noMan); const r2 = restore(noMan, names.b); assert.equal(r2.code, 3, r2.out);
    assert.equal(await tableCount(names.b), 0, "target must stay empty");
  });
  await step("5 a truncated dump with a 'fixed' manifest fails inside the transaction: rolled back, target still empty", async () => {
    const t = join(dir, "acca-2001-01-01T00-00-00-000Z.dump"); writeFileSync(t, readFileSync(plain).subarray(0, Math.floor(statSync(plain).size * 0.6)));
    const m = JSON.parse(readFileSync(`${plain}.manifest.json`, "utf8")); m.file.sha256 = createHash("sha256").update(readFileSync(t)).digest("hex"); m.file.name = "t.dump"; writeFileSync(`${t}.manifest.json`, JSON.stringify(m));
    const r = restore(t, names.c); assert.equal(r.code, 6, r.out); assert.equal(await tableCount(names.c), 0, "partial restore left tables behind");
  });
  await step("6 encrypted backup: no plaintext on disk, restores with the passphrase, rejects a wrong passphrase and tampering", async () => {
    const b = backup({ BACKUP_PASSPHRASE: PASS }); assert.equal(b.code, 0, b.out); assert.match(b.out, /AES-256-GCM/);
    const enc = latest(".enc"); const raw = readFileSync(enc);
    assert.ok(!raw.includes("PGDMP") && !raw.includes("admin@example.com") && !raw.includes("Demo Admin"), "plaintext visible in the encrypted file");
    const ok = restore(enc, names.d, { BACKUP_PASSPHRASE: PASS }); assert.equal(ok.code, 0, ok.out); assert.match(ok.out, /decrypted and authenticated/);
    const noPass = restore(enc, names.e); assert.equal(noPass.code, 3, noPass.out); assert.match(noPass.out, /BACKUP_PASSPHRASE/);
    const wrong = restore(enc, names.e, { BACKUP_PASSPHRASE: "another-passphrase-0123456" }); assert.equal(wrong.code, 3, wrong.out); assert.match(wrong.out, /wrong passphrase|tampered/);
    const tampered = join(dir, "acca-2002-01-01T00-00-00-000Z.dump.enc"); const t = Buffer.from(raw); t.writeUInt8(t.readUInt8(200) ^ 1, 200); writeFileSync(tampered, t);
    const m = JSON.parse(readFileSync(`${enc}.manifest.json`, "utf8")); m.file.sha256 = createHash("sha256").update(t).digest("hex"); writeFileSync(`${tampered}.manifest.json`, JSON.stringify(m));
    const rt = restore(tampered, names.e, { BACKUP_PASSPHRASE: PASS }); assert.equal(rt.code, 3, rt.out);
    assert.equal(await tableCount(names.e), 0);
  });
  await step("7 verification catches a backup whose audit log was rewritten behind the application's back", async () => {
    const firstRow = await src.auditEvent.findFirstOrThrow({ orderBy: { seq: "asc" } });
    await src.$transaction([src.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER USER`), src.$executeRawUnsafe(`UPDATE "AuditEvent" SET "action" = 'tampered' WHERE "id" = '${firstRow.id}'`), src.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER USER`)]);
    const b = backup(); assert.equal(b.code, 0, b.out);
    const r = restore(latest(".dump"), names.f); assert.equal(r.code, 5, r.out); assert.match(r.out, /audit chain broken/);
    await src.$transaction([src.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER USER`), src.$executeRawUnsafe(`UPDATE "AuditEvent" SET "action" = '${firstRow.action}' WHERE "id" = '${firstRow.id}'`), src.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER USER`)]);
  });
  await step("8 without the chain key the audit chain is reported NOT VERIFIED (never silently 'ok')", async () => {
    const r = sh("npx", ["tsx", "scripts/db-restore.ts"], { BACKUP_FILE: latest(".dump"), RESTORE_TARGET_URL: dbUrl(names.g), AUTH_SECRET: "", AUDIT_CHAIN_SECRET: "" }); assert.equal(r.code, 0, r.out); assert.match(r.out, /audit chain NOT VERIFIED/);
  });
  await step("9 retention keeps the newest N backups of its own naming and never touches other files", async () => {
    writeFileSync(join(dir, "keep-me.txt"), "x");
    for (let i = 0; i < 2; i++) { const b = backup({ BACKUP_KEEP: "2" }); assert.equal(b.code, 0, b.out); }
    const dumps = readdirSync(dir).filter((f) => /^acca-.*\.dump(\.enc)?$/.test(f));
    assert.equal(dumps.length, 2, `kept ${dumps.length}`); assert.ok(existsSync(join(dir, "keep-me.txt")), "unrelated file removed");
    for (const d of dumps) assert.ok(existsSync(join(dir, `${d}.manifest.json`)));
  });
  await src.$disconnect();
}

main()
  .catch((e) => { results.push(["setup / fatal", false]); console.log("  FATAL", e instanceof Error ? e.message : e); })
  .finally(() => {
    for (const n of Object.values(names)) { try { psqlAdmin(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`); } catch { /* best effort */ } }
    rmSync(dir, { recursive: true, force: true });
    const failed = results.filter((r) => !r[1]).length;
    console.log(`\n${results.length - failed}/${results.length} steps passed`);
    process.exit(failed ? 1 : 0);
  });
