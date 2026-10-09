/** Audit chain rules: pure chain + the active provider's service (+ database-level protection on PostgreSQL).   npm run test:audit */
import assert from "node:assert/strict";
import { canonicalMeta, computeHash, deriveChainKey, GENESIS_HASH, verifyChain, type AuditEventRec } from "../../src/lib/audit-chain";
import { services } from "../../src/services";

async function main() {
  // ── pure chain
  const key = deriveChainKey("k".repeat(40));
  const mk = (n: number, prev: string): AuditEventRec => {
    const base = { id: `e${n}`, at: `2026-01-0${n}T10:00:00.000Z`, actorType: "admin" as const, actorId: "u1", actorEmail: "a@x.co", action: "materials.update", targetType: "materials", targetId: "m1", outcome: "success" as const, metaJson: undefined, ip: "1.2.3.4", prevHash: prev };
    return { ...base, seq: n, hash: computeHash(key, base) };
  };
  const e1 = mk(1, GENESIS_HASH), e2 = mk(2, e1.hash), e3 = mk(3, e2.hash);
  assert.deepEqual(verifyChain(key, [e1, e2, e3], GENESIS_HASH), { ok: true, checked: 3, head: e3.hash });
  assert.deepEqual(verifyChain(key, [e2, e3]), { ok: true, checked: 2, head: e3.hash }, "a window verifies on its own");
  assert.equal(verifyChain(key, [e1, { ...e2, action: "materials.delete" }, e3], GENESIS_HASH).ok, false, "edited content");
  const edited = verifyChain(key, [e1, { ...e2, outcome: "failed" }, e3], GENESIS_HASH); assert.ok(!edited.ok && edited.badId === "e2" && edited.reason === "HASH");
  const removed = verifyChain(key, [e1, e3], GENESIS_HASH); assert.ok(!removed.ok && removed.badId === "e3" && removed.reason === "LINK", "a deleted row breaks the link");
  assert.equal(verifyChain(key, [e2, e1, e3], GENESIS_HASH).ok, false, "re-ordering");
  assert.equal(verifyChain(key, [{ ...e1, actorEmail: "b@x.co" }], GENESIS_HASH).ok, false, "actor edited");
  assert.equal(verifyChain(deriveChainKey("z".repeat(40)), [e1], GENESIS_HASH).ok, false, "another key cannot validate (nor forge) the chain");
  // ── metadata is bounded, canonical and redacted
  assert.equal(canonicalMeta({ b: 1, a: 2 }), '{"a":2,"b":1}');
  const red = JSON.parse(canonicalMeta({ password: "hunter2", newPassword: "x", apiToken: "t", totpCode: "123456", recoveryCodes: ["a"], secretKey: "s", cookie: "c", safe: "ok" })!);
  assert.equal(red.safe, "ok"); for (const k of Object.keys(red)) if (k !== "safe") assert.equal(red[k], "[redacted]", k);
  assert.ok(!canonicalMeta({ password: "hunter2" })!.includes("hunter2"));
  assert.equal(canonicalMeta({}), undefined); assert.ok(canonicalMeta({ x: "y".repeat(5000) })!.length <= 2000);
  assert.ok(JSON.parse(canonicalMeta({ long: "q".repeat(500) })!).long.length <= 201, "long values are clipped");

  // ── service (active provider)
  const tag = `t${Date.now()}`;
  const before = (await services.audit.list({ pageSize: 1 })).total;
  await services.audit.record({ actor: { type: "admin", id: "u-1", email: `${tag}@example.com` }, action: "materials.update", target: { type: "materials", id: "m-1" }, meta: { fields: ["title"], password: "leak-me" }, ip: "10.0.0.1" });
  await services.audit.record({ actor: { type: "system", id: "stripe" }, action: "payment.refunded", target: { type: "payment", id: "p-1" }, outcome: "success" });
  await services.audit.record({ actor: { type: "admin", id: "u-1", email: `${tag}@example.com` }, action: "auth.mfa_failed", outcome: "failed" });
  assert.equal((await services.audit.list({ pageSize: 1 })).total, before + 3);
  const mine = await services.audit.list({ actor: tag.toUpperCase() });
  assert.equal(mine.total, 2, "actor filter is case-insensitive"); assert.equal(mine.items[0]!.action, "auth.mfa_failed", "newest first");
  assert.ok(!JSON.stringify(mine.items).includes("leak-me"), "secret value stored");
  assert.equal((await services.audit.list({ action: "payment" })).items.filter((e) => e.action.startsWith("payment")).length >= 1, true, "prefix filter");
  assert.equal((await services.audit.list({ actor: tag, outcome: "failed" })).total, 1);
  assert.equal((await services.audit.list({ pageSize: 1, page: 2 })).items.length, 1, "pagination");

  // concurrent appends keep ONE linear chain
  await Promise.all(Array.from({ length: 25 }, (_, i) => services.audit.record({ actor: { type: "admin", id: "u-2", email: `${tag}-par@example.com` }, action: "tests.publish", target: { type: "tests", id: `t${i}` } })));
  const v = await services.audit.verify();
  assert.ok(v.ok, `chain after concurrent writes: ${JSON.stringify(v)}`);
  assert.equal((await services.audit.list({ actor: `${tag}-par` })).total, 25);
  assert.ok((await services.audit.verify(10)).ok, "window verify");
  for (const m of Object.keys(services.audit)) assert.ok(["record", "list", "verify"].includes(m), `audit service exposes ${m}`);

  // ── database protection (PostgreSQL only)
  if (process.env.DATA_PROVIDER === "prisma") {
    const { getPrisma } = await import("../../src/lib/prisma");
    const prisma = getPrisma();
    const row = await prisma.auditEvent.findFirstOrThrow({ orderBy: { seq: "asc" } });
    await assert.rejects(() => prisma.auditEvent.update({ where: { id: row.id }, data: { action: "x.y" } }), /append-only/, "UPDATE must be rejected by the database");
    await assert.rejects(() => prisma.auditEvent.delete({ where: { id: row.id } }), /append-only/, "DELETE must be rejected");
    await assert.rejects(() => prisma.auditEvent.deleteMany({}), /append-only/, "bulk DELETE must be rejected");
    await assert.rejects(() => prisma.$executeRawUnsafe(`TRUNCATE "AuditEvent"`), /append-only/, "TRUNCATE must be rejected");
    await assert.rejects(() => prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET "outcome" = 'success'`), /append-only/, "raw UPDATE must be rejected");
    assert.ok((await services.audit.verify()).ok, "rejected writes changed nothing");
    // a privileged actor who disables the trigger CAN rewrite a row — and the keyed chain then exposes it
    const orig = row.action;
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER USER`),
      prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET "action" = 'tampered.row' WHERE "id" = '${row.id}'`),
      prisma.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER USER`),
    ]);
    const broken = await services.audit.verify(); assert.ok(!broken.ok && broken.badId === row.id && broken.reason === "HASH", `tampering not detected: ${JSON.stringify(broken)}`);
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER USER`),
      prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET "action" = '${orig}' WHERE "id" = '${row.id}'`),
      prisma.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER USER`),
    ]);
    assert.ok((await services.audit.verify()).ok, "restored → intact again");
  }
  console.log(`audit (${process.env.DATA_PROVIDER ?? "memory"}): all checks passed`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
