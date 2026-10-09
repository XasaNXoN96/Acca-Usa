/**
 * Notes ownership at the SERVICE level (works for both providers: DATA_PROVIDER=memory | prisma):
 * another student can never read, change or delete a note — it is simply "not found".
 *   DATA_PROVIDER=memory npm run test:notes     DATA_PROVIDER=prisma DATABASE_URL=… npm run test:notes
 */
import assert from "node:assert/strict";
import { services } from "../../src/services";

const results: boolean[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(true); console.log("  ok  ", name); } catch (e) { results.push(false); console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 3).join("\n      ")); }
}

async function main() {
  const students = (await services.users.listStudents()).filter((u) => u.role === "STUDENT");
  assert.ok(students.length >= 2, "needs two students");
  const [alice, bob] = [students[0]!.id, students[1]!.id];
  const mat = (await services.materials.listAll()).find((m) => m.kind === "notes" && m.topicId)!;
  let id = "";

  await step("create: own note is returned; anchors validated (both anchors, page 0, negative time, empty and oversize body refused)", async () => {
    const r = await services.notes.create(alice, { materialId: mat.id, body: "  alice note  ", pdfPage: 3 });
    assert.ok(r.ok); assert.equal(r.data.body, "alice note"); assert.equal(r.data.pdfPage, 3); id = r.data.id;
    for (const bad of [{ body: "x", pdfPage: 1, videoSeconds: 1 }, { body: "x", pdfPage: 0 }, { body: "x", videoSeconds: -1 }, { body: "   " }, { body: "x".repeat(2001) }]) {
      const b = await services.notes.create(alice, { materialId: mat.id, ...bad }); assert.ok(!b.ok && b.code === "INVALID", JSON.stringify(bad));
    }
    assert.ok(!(await services.notes.create(alice, { materialId: "nope", body: "x" })).ok, "unknown material accepted");
  });
  await step("another student cannot list, update or delete it (IDOR) — answers look like 'not found'", async () => {
    assert.equal((await services.notes.listForMaterial(bob, mat.id)).length, 0);
    assert.equal((await services.notes.listForUser(bob)).length, 0);
    const u = await services.notes.update(bob, id, "hacked"); assert.ok(!u.ok && u.code === "NOT_FOUND");
    const d = await services.notes.remove(bob, id); assert.ok(!d.ok && d.code === "NOT_FOUND");
    const still = await services.notes.listForMaterial(alice, mat.id); assert.equal(still.length, 1); assert.equal(still[0]!.body, "alice note");
  });
  await step("owner can update, search and delete; search covers text and material title", async () => {
    const u = await services.notes.update(alice, id, "renamed body"); assert.ok(u.ok && u.data.body === "renamed body");
    assert.equal((await services.notes.listForUser(alice, "renamed")).length, 1);
    assert.equal((await services.notes.listForUser(alice, mat.title.slice(0, 5))).length, 1);
    assert.equal((await services.notes.listForUser(alice, "zzzz")).length, 0);
    assert.ok((await services.notes.remove(alice, id)).ok); assert.equal((await services.notes.listForUser(alice)).length, 0);
  });
}
main().then(() => { const bad = results.filter((x) => !x).length; console.log(`\n${results.length - bad}/${results.length} notes checks passed`); process.exit(bad ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
