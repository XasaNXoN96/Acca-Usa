// Migration safety on THROW-AWAY databases only (acca_mig_<ts>); never touches any other database.
//   PG_ADMIN_URL=postgresql://postgres@localhost:5433/postgres node scripts/test-migrations.mjs
// Proves: (1) all migrations apply on an empty database; (2) migrating an OLDER schema that already holds data keeps the
// data and adds the new columns with safe defaults; (3) re-running `migrate deploy` is a no-op that keeps the data;
// (4) the final schema has no drift against prisma/schema.prisma.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const ADMIN_URL = process.env.PG_ADMIN_URL ?? "postgresql://postgres@localhost:5433/postgres";
const mk = (name) => ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`) + (ADMIN_URL.includes("?") ? "" : "?schema=public");
const run = (cmd, args, env = {}) => { const r = spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } }); return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` }; };
const must = (cmd, args, env) => { const r = run(cmd, args, env); if (!r.ok) throw new Error(`${cmd} ${args.join(" ")}\n${r.out.slice(0, 600)}`); return r.out; };
const noSchema = (u) => u.replace(/\?schema=\w+$/, "");
const sql = (url, q) => must("psql", [noSchema(url), "-At", "-c", q]).trim();
const names = readdirSync("prisma/migrations").filter((n) => /^\d+_/.test(n)).sort();
assert.ok(names.length >= 2, "needs at least two migrations");

const A = `acca_mig_a_${Date.now()}`; const B = `acca_mig_b_${Date.now()}`;
const results = []; const step = (n, f) => { try { f(); results.push(true); console.log("  ok  ", n); } catch (e) { results.push(false); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, 3).join("\n      ")); } };
const staged = mkdtempSync(join(tmpdir(), "mig-stage-"));
try {
  must("psql", [ADMIN_URL, "-c", `CREATE DATABASE ${A}`]); must("psql", [ADMIN_URL, "-c", `CREATE DATABASE ${B}`]);
  const urlA = mk(A); const urlB = mk(B);

  step("all migrations apply on an EMPTY database; status is clean; no drift against schema.prisma", () => {
    must("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: urlA });
    assert.match(must("npx", ["prisma", "migrate", "status"], { DATABASE_URL: urlA }), /Database schema is up to date/);
    const diff = run("npx", ["prisma", "migrate", "diff", "--from-url", urlA, "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"]);
    assert.ok(diff.ok, `schema drift:\n${diff.out.slice(0, 500)}`);
    assert.equal(sql(urlA, `SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL`), String(names.length));
  });

  step("migrating an OLDER schema that already holds data keeps every row and adds the new columns with safe defaults", () => {
    // stage: only the first migration, applied with a copy of the repo's migration folder
    mkdirSync(join(staged, "prisma", "migrations"), { recursive: true });
    cpSync(join("prisma", "migrations", names[0]), join(staged, "prisma", "migrations", names[0]), { recursive: true });
    cpSync(join("prisma", "migrations", "migration_lock.toml"), join(staged, "prisma", "migrations", "migration_lock.toml"));
    cpSync("prisma/schema.prisma", join(staged, "prisma", "schema.prisma"));
    must("npx", ["prisma", "migrate", "deploy", "--schema", join(staged, "prisma", "schema.prisma")], { DATABASE_URL: urlB });
    sql(urlB, `INSERT INTO "Platform"(slug,name,"fullName","updatedAt") VALUES ('acca','ACCA','Assoc',now())`);
    sql(urlB, `INSERT INTO "User"(id,name,email,"updatedAt") VALUES ('u1','Old User','old@example.com',now())`);
    sql(urlB, `INSERT INTO "Payment"(id,"userId","platformSlug",description,"amountCents",provider,"updatedAt") VALUES ('p1','u1','acca','ACCA',14900,'stripe',now())`);
    sql(urlB, `INSERT INTO "Level"(id,"platformSlug","order",name) VALUES ('l1','acca',1,'Applied Knowledge')`);
    sql(urlB, `INSERT INTO "Subject"(slug,code,name,"levelId","updatedAt") VALUES ('bt','BT','Business and Technology','l1',now())`);
    sql(urlB, `INSERT INTO "Material"(id,"subjectSlug",kind,title,body,"updatedAt") VALUES ('m-legacy-1','bt','notes','Legacy notes','Some text that existed before publication states',now())`);
    sql(urlB, `INSERT INTO "Test"(id,"subjectSlug",title,"durationMinutes","passMark","updatedAt") VALUES ('t-legacy-1','bt','Legacy test',30,60,now())`);
    sql(urlB, `INSERT INTO "StoredFile"(id,"storageKey",name,mime,size,"ownerId") VALUES ('f-legacy-1','files/f-legacy-1','lecture.mp4','video/mp4',1234,'u1')`);
    // now apply everything that is pending using the REAL migration folder
    must("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: urlB });
    assert.equal(sql(urlB, `SELECT count(*) FROM "User"`), "1"); assert.equal(sql(urlB, `SELECT count(*) FROM "Payment"`), "1");
    assert.equal(sql(urlB, `SELECT name FROM "User" WHERE id='u1'`), "Old User");
    assert.equal(sql(urlB, `SELECT "amountCents" FROM "Payment" WHERE id='p1'`), "14900", "payment untouched");
    assert.equal(sql(urlB, `SELECT "priceCents" FROM "Platform" WHERE slug='acca'`), "0", "new price column defaults to free (0)");
    assert.equal(sql(urlB, `SELECT "checkoutUrl" IS NULL FROM "Payment" WHERE id='p1'`), "t", "new nullable column");
    assert.equal(sql(urlB, `SELECT published FROM "Material" WHERE id='m-legacy-1'`), "t", "materials that existed before stay PUBLISHED (students keep seeing them)");
    assert.equal(sql(urlB, `SELECT "publishAt" IS NULL AND position = 0 FROM "Material" WHERE id='m-legacy-1'`), "t");
    assert.equal(sql(urlB, `SELECT body FROM "Material" WHERE id='m-legacy-1'`), "Some text that existed before publication states", "content untouched");
    assert.equal(sql(urlB, `SELECT count(*) FROM "MaterialVersion"`), "0");
    assert.equal(sql(urlB, `SELECT "reviewPolicy" FROM "Test" WHERE id='t-legacy-1'`), "IMMEDIATE", "existing tests keep showing their review immediately");
    assert.equal(sql(urlB, `SELECT kind FROM "Test" WHERE id='t-legacy-1'`), "topic_test");
    assert.equal(sql(urlB, `SELECT status FROM "StoredFile" WHERE id='f-legacy-1'`), "READY", "files uploaded before the media pipeline stay servable (READY)");
    assert.equal(sql(urlB, `SELECT attempts FROM "StoredFile" WHERE id='f-legacy-1'`), "0"); assert.equal(sql(urlB, `SELECT "playbackFileId" IS NULL FROM "StoredFile" WHERE id='f-legacy-1'`), "t");
  });

  step("re-running migrate deploy is a no-op and keeps the data", () => {
    const out = must("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: urlB });
    assert.match(out, /No pending migrations|already in sync/i, out.slice(0, 300));
    assert.equal(sql(urlB, `SELECT count(*) FROM "User"`), "1"); assert.equal(sql(urlB, `SELECT count(*) FROM "Payment"`), "1");
  });

  step("records of fact are protected: a payer / certificate holder cannot be deleted while records exist (RESTRICT)", () => {
    const r = run("psql", [noSchema(urlB), "-At", "-c", `DELETE FROM "User" WHERE id='u1'`]);
    assert.ok(!r.ok && /violates foreign key/.test(r.out), `delete should be refused: ${r.out.slice(0, 200)}`);
    assert.equal(sql(urlB, `SELECT count(*) FROM "User"`), "1");
  });

  step("no migration contains a destructive statement (DROP TABLE / DROP COLUMN / TRUNCATE / DELETE FROM) except documented ones", () => {
    for (const n of names) {
      const text = must("cat", [join("prisma", "migrations", n, "migration.sql")]);
      const bad = text.split("\n").filter((l) => /^\s*(DROP TABLE|DROP COLUMN|ALTER TABLE .* DROP COLUMN|TRUNCATE|DELETE FROM)/i.test(l));
      assert.equal(bad.length, 0, `${n}: ${bad.join(" | ")}`);
    }
  });
} catch (e) { results.push(false); console.log("  FATAL", e.message); }
finally {
  for (const d of [A, B]) run("psql", [ADMIN_URL, "-c", `DROP DATABASE IF EXISTS ${d}`]);
  rmSync(staged, { recursive: true, force: true });
}
const failed = results.filter((r) => !r).length; console.log(`\n${results.length - failed}/${results.length} steps passed`); process.exit(failed ? 1 : 0);
