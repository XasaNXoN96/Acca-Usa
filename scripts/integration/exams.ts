/**
 * Exam builder rules at the SERVICE level — runs on both providers (DATA_PROVIDER=memory | prisma):
 * validation, separation from topic tests, availability window, server deadline, attempt limit, review policy.
 *   npm run test:exams   (memory)      DATA_PROVIDER=prisma DATABASE_URL=… npm run test:exams
 */
import assert from "node:assert/strict";
import { services } from "../../src/services";
import type { TestInput } from "../../src/services/contracts";

const results: boolean[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(true); console.log("  ok  ", name); } catch (e) { results.push(false); console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 4).join("\n      ")); }
}
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const H = 3_600_000;

async function main() {
  const student = (await services.users.listStudents()).find((u) => u.role === "STUDENT" && u.status === "active" && !u.archived)!;
  const bank = (await services.questions.list()).filter((q) => q.status === "published" && !q.archived && q.subjectSlug === "bt");
  const subjectSlug = "bt";
  assert.ok(bank.length >= 3, "needs three published BT questions");
  const qids = bank.slice(0, 3).map((q) => q.id);
  const base: TestInput = {
    kind: "exam", title: "Exam builder test", description: "Read the instructions.", subjectSlug, durationMinutes: 60, passMark: 50, attemptsAllowed: 1,
    randomizeQuestions: false, randomizeAnswers: false, questionIds: qids, published: true, opensAt: iso(-H), closesAt: iso(48 * H), reviewPolicy: "IMMEDIATE",
  };
  const make = async (over: Partial<TestInput>) => {
    const r = await services.tests.create({ ...base, ...over });
    assert.ok(r.ok, `create failed: ${JSON.stringify(r)}`);
    return r.data.id;
  };
  const answerAll = (testId: string) => ({ userId: student.id, testId, answers: {} as Record<string, string>, flagged: [] as string[] });

  await step("validation: no questions, closes ≤ opens, questions of another subject are refused; topicId is ignored for exams", async () => {
    const none = await services.tests.create({ ...base, questionIds: [] }); assert.ok(!none.ok && none.code === "QUESTIONS_REQUIRED");
    const win = await services.tests.create({ ...base, opensAt: iso(2 * H), closesAt: iso(H) }); assert.ok(!win.ok && win.code === "WINDOW_INVALID" && win.field === "closesAt");
    const eq = await services.tests.create({ ...base, opensAt: iso(H), closesAt: iso(H) }); assert.ok(!eq.ok && eq.code === "WINDOW_INVALID");
    const other = (await services.questions.list()).find((q) => q.status === "published" && !q.archived && q.subjectSlug !== subjectSlug);
    if (other) { const bad = await services.tests.create({ ...base, questionIds: [other.id] }); assert.ok(!bad.ok && bad.code === "QUESTION_SUBJECT_MISMATCH"); }
    const topic = (await services.topics.listAll()).find((t) => t.subjectSlug === subjectSlug)!;
    const id = await make({ title: "Topic ignored", topicId: topic.id });
    const found = (await services.tests.listAllForAdmin("exam")).find((t) => t.id === id)!;
    assert.equal(found.topicId, undefined, "an exam must not be attached to a topic (it would count in topic progress)");
  });

  await step("exams and topic tests are separate: an exam is not a topic test and vice versa; admin lists are per kind", async () => {
    const id = await make({ title: "Separate exam" });
    assert.ok(!(await services.tests.listPublished(student.id)).some((t) => t.id === id), "exam leaked into the topic-test catalogue");
    assert.ok(!(await services.tests.listForSubject(subjectSlug, student.id)).some((t) => t.id === id), "exam leaked into the subject's tests");
    assert.ok(!(await services.tests.listAllForAdmin()).some((t) => t.id === id), "exam in the default (topic test) admin list");
    const exams = await services.tests.listAllForAdmin("exam"); const row = exams.find((t) => t.id === id)!;
    assert.ok(row && row.kind === "exam" && row.reviewPolicy === "IMMEDIATE" && row.opensAt && row.closesAt);
    assert.ok(exams.every((t) => t.kind === "exam"));
    const list = await services.exams.list(student.id); assert.ok(list.some((e) => e.id === id && e.status === "open"));
    assert.ok(!list.some((e) => e.id === (null as unknown as string)));
    const topicTest = (await services.tests.listPublished(student.id))[0]; if (topicTest) assert.ok(!list.some((e) => e.id === topicTest.id), "topic test listed as an exam");
  });

  await step("availability window is enforced on the server: before opening → EXAM_NOT_OPEN, after closing → EXAM_CLOSED, inside → starts", async () => {
    const future = await make({ title: "Future exam", opensAt: iso(2 * H), closesAt: iso(5 * H) });
    const past = await make({ title: "Past exam", opensAt: iso(-5 * H), closesAt: iso(-2 * H) });
    const open = await make({ title: "Open exam" });
    const f = await services.tests.startAttempt(student.id, future); assert.ok(!f.ok && f.code === "EXAM_NOT_OPEN");
    const p = await services.tests.startAttempt(student.id, past); assert.ok(!p.ok && p.code === "EXAM_CLOSED");
    const o = await services.tests.startAttempt(student.id, open); assert.ok(o.ok);
    const statuses = new Map((await services.exams.list(student.id)).map((e) => [e.id, e.status]));
    assert.equal(statuses.get(future), "scheduled"); assert.equal(statuses.get(past), "completed"); assert.equal(statuses.get(open), "open");
  });

  await step("the attempt deadline is never later than the closing time (even with a 60 minute duration)", async () => {
    const closing = await make({ title: "Closing soon", durationMinutes: 60, opensAt: null, closesAt: iso(90_000) });
    const a = await services.tests.startAttempt(student.id, closing); assert.ok(a.ok);
    const deadline = new Date(a.data.deadlineAt).getTime();
    assert.ok(deadline <= Date.now() + 91_000, `deadline ${a.data.deadlineAt} is later than the closing time`);
    const plain = await make({ title: "Plain duration", durationMinutes: 30, opensAt: null, closesAt: iso(48 * H) });
    const b = await services.tests.startAttempt(student.id, plain); assert.ok(b.ok);
    assert.ok(Math.abs(new Date(b.data.deadlineAt).getTime() - (Date.now() + 30 * 60_000)) < 10_000, "duration deadline");
  });

  await step("attempt limit: one attempt allowed → the second start is refused; submitted result is stored", async () => {
    const id = await make({ title: "One attempt" });
    const a = await services.tests.startAttempt(student.id, id); assert.ok(a.ok);
    const s = await services.tests.submit(answerAll(id)); assert.ok(s.ok);
    const again = await services.tests.startAttempt(student.id, id); assert.ok(!again.ok && again.code === "ATTEMPTS_EXHAUSTED");
    const r = await services.tests.getResult(id, student.id); assert.ok(r && r.total === 3 && r.scorePercent === 0 && r.unanswered === 3);
    const exam = (await services.exams.list(student.id)).find((e) => e.id === id)!; assert.equal(exam.attemptsUsed, 1); assert.equal(exam.score, 0);
  });

  await step("review policy: IMMEDIATE shows it; NEVER and AFTER_CLOSE (before closing) hide it and keep the score; closing reveals AFTER_CLOSE; hidden exams never leak into 'my mistakes'", async () => {
    const imm = await make({ title: "Review now", reviewPolicy: "IMMEDIATE" });
    const never = await make({ title: "Review never", reviewPolicy: "NEVER" });
    const later = await make({ title: "Review later", reviewPolicy: "AFTER_CLOSE" });
    for (const id of [imm, never, later]) { assert.ok((await services.tests.startAttempt(student.id, id)).ok); assert.ok((await services.tests.submit(answerAll(id))).ok); }
    const r1 = (await services.tests.getResult(imm, student.id))!; assert.equal(r1.review.length, 3); assert.equal(r1.reviewHidden, undefined);
    const r2 = (await services.tests.getResult(never, student.id))!; assert.equal(r2.review.length, 0); assert.equal(r2.reviewHidden, "never"); assert.equal(r2.total, 3); assert.equal(r2.scorePercent, 0);
    const r3 = (await services.tests.getResult(later, student.id))!; assert.equal(r3.review.length, 0); assert.equal(r3.reviewHidden, "after_close");
    const open = await services.mistakes.list(student.id);
    assert.ok(open.some((m) => m.testId === imm), "visible exam review should feed my mistakes");
    assert.ok(!open.some((m) => m.testId === never || m.testId === later), "a hidden exam review leaked through my mistakes");
    // the admin closes the exam: the review is released without touching the stored result
    const edit = (await services.tests.listAllForAdmin("exam")).find((t) => t.id === later)!;
    const u = await services.tests.update(later, { ...base, title: edit.title, questionIds: edit.questionIds, reviewPolicy: "AFTER_CLOSE", opensAt: iso(-3 * H), closesAt: iso(-H) });
    assert.ok(u.ok); const r4 = (await services.tests.getResult(later, student.id))!; assert.equal(r4.review.length, 3); assert.equal(r4.reviewHidden, undefined);
    assert.ok((await services.mistakes.list(student.id)).some((m) => m.testId === later), "released review should appear in my mistakes");
  });

  await step("admin lifecycle: draft is invisible, publish/unpublish, duplicate (draft, still an exam), archive, kind cannot be changed by update", async () => {
    const id = await make({ title: "Lifecycle exam", published: false });
    assert.ok(!(await services.exams.list(student.id)).some((e) => e.id === id), "draft exam visible");
    assert.ok((await services.tests.setPublished(id, true)).ok); assert.ok((await services.exams.list(student.id)).some((e) => e.id === id));
    assert.ok((await services.tests.setPublished(id, false)).ok); assert.ok(!(await services.exams.list(student.id)).some((e) => e.id === id));
    assert.ok((await services.tests.setPublished(id, true)).ok);
    const dup = await services.tests.duplicate(id); assert.ok(dup.ok);
    const copy = (await services.tests.listAllForAdmin("exam")).find((t) => t.id === dup.data.id)!; assert.ok(copy && copy.kind === "exam" && !copy.published && copy.title.endsWith("(copy)") && copy.closesAt === (await services.tests.listAllForAdmin("exam")).find((t) => t.id === id)!.closesAt);
    const edit = (await services.tests.listAllForAdmin("exam")).find((t) => t.id === id)!;
    assert.ok((await services.tests.update(id, { ...base, kind: "topic_test", title: "Renamed exam", questionIds: edit.questionIds })).ok);
    const after = (await services.tests.listAllForAdmin("exam")).find((t) => t.id === id)!; assert.equal(after.title, "Renamed exam"); assert.equal(after.kind, "exam", "update changed the kind");
    assert.ok((await services.tests.setArchived(id, true)).ok); assert.ok(!(await services.exams.list(student.id)).some((e) => e.id === id), "archived exam visible");
    assert.ok(!(await services.tests.setPublished("nope", true)).ok);
  });
}
main().then(() => { const bad = results.filter((x) => !x).length; console.log(`\n${results.length - bad}/${results.length} exam checks passed`); process.exit(bad ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
