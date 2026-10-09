// Smoke test: exam builder (admin) + student exam flow. (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0], String(e.stack).split("\n").find((l) => l.includes("smoke-exams")) ?? ""); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const RIGHT = { "Which best describes": "Any individual or group affected by, or able to affect, the organisation", "A shareholder is": "Owns shares in the company" };
const WRONG = { "Which best describes": "Only the owners of the company" };

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
const picker = () => a.getByRole("dialog").filter({ hasText: "Published questions of the selected subject" });

async function fillExam({ title, opens = "", closes = "", review = "Review available right after submitting", attempts = "1", publish = false, pick = true }) {
  await a.goto("/admin/exams"); await a.getByRole("button", { name: "Schedule exam" }).first().click(); await a.getByRole("dialog").waitFor();
  await a.locator("#f-title").fill(title); await a.locator("#f-description").fill(`Instructions for ${title}: read carefully.`);
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" });
  await a.locator("#f-durationMinutes").fill("30"); await a.locator("#f-passMark").fill("50"); await a.locator("#f-attemptsAllowed").fill(attempts);
  if (opens) await a.locator("#f-opensAt").fill(opens); if (closes) await a.locator("#f-closesAt").fill(closes);
  await a.locator("#f-reviewPolicy").selectOption({ label: review });
  if (pick) {
    await a.getByRole("button", { name: "Add questions" }).click(); await picker().getByText(/Which best describes a stakeholder/).click(); await picker().getByText(/A shareholder is a stakeholder|shareholder is/i).first().click();
    await picker().getByRole("button", { name: /Add selected \(2\)/ }).click();
  }
  if (publish) await a.getByRole("checkbox", { name: "Published" }).check();
}
const save = async () => { await a.getByRole("button", { name: "Save", exact: true }).click(); };
async function createExam(o) { await fillExam(o); await save(); await a.getByText("Saved.").waitFor(); }
async function answerExam(p, wrongFirst) {
  await p.getByRole("button", { name: /Start test|Resume test/ }).click(); await p.getByText(/Question 1 of 2/).waitFor();
  for (let i = 0; i < 2; i++) {
    await p.getByText(`Question ${i + 1} of 2`).waitFor(); const q = await p.locator("h2").first().innerText();
    const key = Object.keys(RIGHT).find((k) => q.includes(k)); assert(key, `unknown question ${q}`);
    const text = wrongFirst && WRONG[key] ? WRONG[key] : RIGHT[key];
    await p.getByRole("radio").filter({ hasText: text.slice(0, 40) }).first().click();
    if (i < 1) await p.getByRole("button", { name: "Next", exact: true }).click();
  }
  await p.getByRole("button", { name: "Submit test" }).first().click(); await p.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await p.waitForURL(/result/);
}
const examRow = (title) => s.locator("tr, li, [role=row]", { hasText: title }).first();

await step("form validation: no questions and a closing time before the opening time are refused with clear messages", async () => {
  await fillExam({ title: "Invalid exam", opens: "2030-01-02T10:00", closes: "2030-01-01T10:00", pick: false });
  await save(); await a.getByText("Select at least one question.").waitFor(); await a.getByText("The closing time must be after the opening time.").waitFor();
  await a.keyboard.press("Escape");
});

await step("create a draft exam: it appears in the admin list as a draft and students do not see it", async () => {
  await createExam({ title: "Exam A draft", opens: "2020-01-01T08:00", closes: "2099-01-01T08:00", review: "No question review (score only)" });
  await a.getByRole("row", { name: /Exam A draft/ }).waitFor(); assert(/Draft/.test(await a.getByRole("row", { name: /Exam A draft/ }).innerText()), "not a draft");
  await s.goto("/exams"); assert(!(await s.content()).includes("Exam A draft"), "student sees a draft exam");
});

await step("publish: the exam shows as Open with its end date and attempts; a scheduled and a closed exam show their status and cannot be started", async () => {
  await a.goto("/admin/exams"); await a.getByRole("button", { name: /^Publish: Exam A draft/ }).click(); await a.getByText(/published/i).first().waitFor();
  await createExam({ title: "Exam B scheduled", opens: "2098-01-01T08:00", closes: "2099-01-01T08:00", publish: true });
  await createExam({ title: "Exam C closed", opens: "2020-01-01T08:00", closes: "2021-01-01T08:00", publish: true });
  await s.goto("/exams");
  const a1 = examRow("Exam A draft"); await a1.getByText("Open", { exact: true }).waitFor(); await a1.getByRole("link", { name: "Start exam" }).waitFor();
  const b = examRow("Exam B scheduled"); await b.getByText("Scheduled", { exact: true }).waitFor(); assert((await b.getByRole("link", { name: "Start exam" }).count()) === 0, "scheduled exam can be started");
  const c = examRow("Exam C closed"); await c.getByText("Completed", { exact: true }).waitFor(); assert((await c.getByRole("link", { name: "Start exam" }).count()) === 0, "closed exam can be started");
});

await step("student takes the exam: instructions shown, result saved, review hidden by the policy, attempts used, a second attempt is refused", async () => {
  await s.goto("/exams"); await examRow("Exam A draft").getByRole("link", { name: "Start exam" }).click(); await s.waitForURL(/\/test\//);
  await s.getByText(/Instructions for Exam A draft/).waitFor();
  await answerExam(s, true);
  await s.getByText("50%").first().waitFor();
  await s.locator("[data-review-hidden='never']").waitFor(); assert((await s.locator("#review").count()) === 0, "review rendered although hidden");
  assert((await s.getByRole("link", { name: "Review all my mistakes" }).count()) === 0, "mistakes link offered for a hidden review");
  await s.goto("/exams"); await examRow("Exam A draft").getByText("1 / 1").waitFor();
  await examRow("Exam A draft").getByRole("link", { name: "Start exam" }).click();
  await s.getByText(/You have used all attempts/).waitFor(); assert((await s.getByRole("button", { name: /Start test/ }).count()) === 0, "start offered with no attempts left");
});

await step("a hidden exam review never leaks through 'my mistakes'", async () => {
  await s.goto("/mistakes"); assert(!(await s.content()).includes("Which best describes a stakeholder"), "hidden exam answers leaked into my mistakes");
  await s.getByText("No mistakes yet").waitFor();
});

await step("review policies: IMMEDIATE shows the review; AFTER_CLOSE stays hidden until the exam closes", async () => {
  await createExam({ title: "Exam D immediate", opens: "2020-01-01T08:00", closes: "2099-01-01T08:00", publish: true });
  await createExam({ title: "Exam E after close", opens: "2020-01-01T08:00", closes: "2099-01-01T08:00", review: "Review available after the exam closes", publish: true });
  await s.goto("/exams"); await examRow("Exam D immediate").getByRole("link", { name: "Start exam" }).click(); await answerExam(s, true);
  await s.locator("#review").waitFor(); assert((await s.locator("[data-review-hidden]").count()) === 0, "review hidden for IMMEDIATE");
  await s.goto("/exams"); await examRow("Exam E after close").getByRole("link", { name: "Start exam" }).click(); await answerExam(s, false);
  await s.locator("[data-review-hidden='after_close']").waitFor();
  await s.getByText("becomes available after the exam closes").waitFor();
});

await step("edit, duplicate and archive: duplicate is a draft copy; archived exams disappear for students", async () => {
  await a.goto("/admin/exams"); await a.getByRole("row", { name: /Exam D immediate/ }).getByRole("button", { name: /edit/i }).click();
  await a.locator("#f-title").fill("Exam D renamed"); await save(); await a.getByText("Saved.").waitFor();
  await a.getByRole("row", { name: /Exam D renamed/ }).waitFor();
  await a.getByRole("button", { name: /^Duplicate: Exam D renamed/ }).click(); await a.getByRole("row", { name: /Exam D renamed \(copy\)/ }).waitFor();
  assert(/Draft/.test(await a.getByRole("row", { name: /Exam D renamed \(copy\)/ }).innerText()), "copy is not a draft");
  await a.getByRole("row", { name: /Exam D renamed \(copy\)/ }).getByRole("button", { name: /archive/i }).click(); await a.getByRole("dialog").getByRole("button", { name: /archive/i }).click();
  await s.goto("/exams"); await s.getByText("Exam D renamed").first().waitFor(); assert(!(await s.content()).includes("(copy)"), "a draft copy is visible");
});

await step("access: students cannot open the exam builder", async () => {
  await s.goto("/admin/exams"); assert(!new URL(s.url()).pathname.startsWith("/admin"), "student reached /admin/exams");
});

await ac.close(); await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
