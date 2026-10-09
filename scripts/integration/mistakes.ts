/**
 * Mistakes review + practice logic with fake records (pure, provider independent).
 *   npm run test:mistakes
 */
import assert from "node:assert/strict";
import { computeMistakes, createMistakeService, type PracticeEvent } from "../../src/services/domain/mistakes";
import type { ReviewItem, TestResult } from "../../src/types";

const results: boolean[] = [];
async function step(name: string, fn: () => Promise<void> | void) {
  try { await fn(); results.push(true); console.log("  ok  ", name); } catch (e) { results.push(false); console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 3).join("\n      ")); }
}

const opts = (id: string) => [{ id: "a", text: `${id}-A` }, { id: "b", text: `${id}-B` }, { id: "c", text: `${id}-C` }];
const item = (id: string, picked: string | null, explanation = `why ${id}`): ReviewItem => ({
  questionId: id, text: `Question ${id}`, options: opts(id), selectedOptionId: picked, correctOptionId: "b", explanation, isCorrect: picked === "b", flagged: false, points: 1,
});
const result = (attemptId: string, submittedAt: string, items: ReviewItem[], testId = "t1"): TestResult => ({
  attemptId, testId, testTitle: "Test one", subjectSlug: "bt", subjectName: "Business", total: items.length, correct: items.filter((i) => i.isCorrect).length, incorrect: 0, unanswered: 0,
  earnedPoints: 0, totalPoints: items.length, scorePercent: 0, passMark: 60, passed: false, timeSpentSeconds: 1, submittedAt, review: items, progressBefore: 0, progressAfter: 0,
});

async function main() {
  await step("only questions that were wrong or skipped appear; a question answered correctly is never listed", () => {
    const m = computeMistakes([result("a1", "2026-01-01T10:00:00Z", [item("q1", "a"), item("q2", "b"), item("q3", null)])], []);
    assert.deepEqual(m.map((x) => x.questionId).sort(), ["q1", "q3"]);
    assert.equal(m.find((x) => x.questionId === "q3")!.selectedOptionId, null);
    assert.ok(m.every((x) => !x.resolved && x.wrongCount === 1));
  });
  await step("a LATER correct attempt resolves it; a later wrong one re-opens it; wrongCount counts attempts", () => {
    const first = result("a1", "2026-01-01T10:00:00Z", [item("q1", "a")]);
    const second = result("a2", "2026-01-02T10:00:00Z", [item("q1", "b")]);
    const third = result("a3", "2026-01-03T10:00:00Z", [item("q1", "c")]);
    assert.equal(computeMistakes([first, second], [])[0]!.resolved, true);
    const reopened = computeMistakes([first, second, third], [])[0]!;
    assert.equal(reopened.resolved, false); assert.equal(reopened.wrongCount, 2); assert.equal(reopened.attemptId, "a3", "shows the latest wrong attempt");
  });
  await step("practice answers resolve / re-open (latest outcome wins); practice never creates a mistake by itself", () => {
    const r = result("a1", "2026-01-01T10:00:00Z", [item("q1", "a")]);
    const ok: PracticeEvent = { questionId: "q1", correct: true, at: "2026-01-02T10:00:00Z" };
    const bad: PracticeEvent = { questionId: "q1", correct: false, at: "2026-01-03T10:00:00Z" };
    assert.equal(computeMistakes([r], [ok])[0]!.resolved, true);
    assert.equal(computeMistakes([r], [ok, bad])[0]!.resolved, false);
    assert.equal(computeMistakes([r], [ok])[0]!.practiceCount, 1);
    assert.equal(computeMistakes([result("a2", "2026-01-01T10:00:00Z", [item("q9", "b")])], [{ questionId: "q9", correct: false, at: "2026-01-02T10:00:00Z" }]).length, 0);
  });
  await step("explanations: shown only when they exist (blank / whitespace → undefined, never invented)", () => {
    const m = computeMistakes([result("a1", "2026-01-01T10:00:00Z", [item("q1", "a", "   "), item("q2", "a", "")]), result("a2", "2026-01-02T10:00:00Z", [item("q3", "a", "Because B.")])], []);
    assert.equal(m.find((x) => x.questionId === "q1")!.explanation, undefined); assert.equal(m.find((x) => x.questionId === "q2")!.explanation, undefined);
    assert.equal(m.find((x) => x.questionId === "q3")!.explanation, "Because B.");
  });
  await step("order: unresolved before resolved, more wrong first; no attempts → empty", () => {
    const m = computeMistakes([result("a1", "2026-01-01T10:00:00Z", [item("q1", "a"), item("q2", "a")]), result("a2", "2026-01-02T10:00:00Z", [item("q1", "b"), item("q2", "a"), item("q3", "a")])], []);
    assert.deepEqual(m.map((x) => x.questionId), ["q2", "q3", "q1"]);
    assert.deepEqual(computeMistakes([], []), []);
  });

  const recorded: { q: string; ok: boolean }[] = [];
  let bankNow: Record<string, { text: string; options: { id: string; text: string }[]; correctOptionId: string; explanation: string } | null> = {};
  const svc = createMistakeService({
    results: async (u) => (u === "alice" ? [result("a1", "2026-01-01T10:00:00Z", [item("q1", "a"), item("q2", "b")])] : []),
    practice: async () => [],
    bank: async (id) => bankNow[id] ?? null,
    record: async (_u, q, ok) => { recorded.push({ q, ok }); },
  });
  await step("service: practice set has NO answer key; check works only for the learner's own mistakes (no key lookup for other questions / users)", async () => {
    const set = await svc.practiceSet("alice", { limit: 10 });
    assert.equal(set.length, 1); assert.equal(set[0]!.id, "q1"); assert.ok(!JSON.stringify(set).includes("correct") && !JSON.stringify(set).includes("why q1"));
    assert.deepEqual(await svc.checkPractice("alice", "q2", "b"), { ok: false, code: "NOT_FOUND" }, "q2 was answered correctly");
    assert.deepEqual(await svc.checkPractice("alice", "zzz", "b"), { ok: false, code: "NOT_FOUND" });
    assert.deepEqual(await svc.checkPractice("bob", "q1", "b"), { ok: false, code: "NOT_FOUND" }, "another learner has no such mistake");
    assert.deepEqual(await svc.checkPractice("alice", "q1", "zz"), { ok: false, code: "INVALID" });
    assert.equal(recorded.length, 0, "nothing recorded for refused checks");
  });
  await step("service: grading uses the CURRENT bank question when it exists, otherwise what the learner saw; records the answer", async () => {
    const right = await svc.checkPractice("alice", "q1", "b"); assert.ok(right.ok && right.data.correct && right.data.explanation === "why q1");
    bankNow = { q1: { text: "Reworded", options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correctOptionId: "a", explanation: "" } };
    const changed = await svc.checkPractice("alice", "q1", "b"); assert.ok(changed.ok && !changed.data.correct && changed.data.correctOptionId === "a" && changed.data.explanation === undefined);
    assert.deepEqual(recorded, [{ q: "q1", ok: true }, { q: "q1", ok: false }]);
    assert.equal((await svc.practiceSet("alice", { limit: 10 }))[0]!.text, "Reworded");
  });
}
main().then(() => { const bad = results.filter((x) => !x).length; console.log(`\n${results.length - bad}/${results.length} mistakes checks passed`); process.exit(bad ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
