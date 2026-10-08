// Smoke test: results, review, attempts and learning progress. BASE_URL=... CHROMIUM=... node scripts/smoke-results.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T = "bt-stakeholders-test";
const T1 = "bt-business-organisations-and-their-stakeholders";
const mat = (x) => `/subject/bt/topic/${T1}/material/${T1}-${x}`;
// correct option text by question (seed data); we answer by the option TEXT so the test does not depend on letter order
const RIGHT = { "Which best describes": "Any individual or group affected by, or able to affect, the organisation", "A shareholder is": "Owns shares in the company", "INTERNAL stakeholder": "Employees", "main objective": "Maximise long-term shareholder wealth", "not-for-profit": "Its surplus is reinvested in its mission rather than distributed to owners", "Mendelow": "Managed closely", "Shareholders want higher dividends": "Stakeholder conflict", "Corporate social responsibility": "Have wider responsibilities to society and the environment" };
const WRONG = { "Which best describes": "Only the owners of the company", "Mendelow": "Monitored only" };

async function takeTest(p, { wrong = [], skip = [] , all = null }) {
  await p.goto(`/test/${T}`); await p.getByRole("button", { name: /Start test|Resume test/ }).click(); await p.getByText(/Question 1 of 8/).waitFor();
  for (let i = 0; i < 8; i++) {
    await p.getByText(`Question ${i + 1} of 8`).waitFor(); const q = await p.locator("h2").first().innerText();
    const key = Object.keys(RIGHT).find((k) => q.includes(k)); assert(key, `unknown question ${q}`);
    const idx = Object.keys(RIGHT).indexOf(key);
    if (!skip.includes(idx)) {
      const text = all === "wrong" || wrong.includes(idx) ? (WRONG[key] ?? (await p.getByRole("radio").evaluateAll((els, r) => els.map((e) => e.textContent).find((t) => !t.includes(r)), RIGHT[key]))) : RIGHT[key];
      await p.getByRole("radio").filter({ hasText: text.slice(0, 40) }).first().click();
    }
    if (i < 7) await p.getByRole("button", { name: "Next", exact: true }).click();
  }
  await p.getByRole("button", { name: "Submit test" }).first().click(); await p.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await p.waitForURL(/result/);
}

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);

await step("result: score, percentage, correct / incorrect / skipped, time spent, pass mark, PASSED", async () => {
  await takeTest(s, { wrong: [0, 5], skip: [7] }); // 5 right, 2 wrong, 1 skipped → 63 %
  await s.getByText("63%").first().waitFor(); await s.getByText(/PASSED|Passed/).first().waitFor();
  const dl = await s.locator("dl").first().innerText(); assert(/Correct\s*5/.test(dl.replace(/\n/g, " ")) || /5/.test(dl), "correct count");
  for (const lbl of ["Correct", "Incorrect", "Skipped|Not answered|Unanswered", "Time"]) assert(new RegExp(lbl).test(dl), `row ${lbl} missing`);
  await s.getByText(/Pass mark: 60%|pass mark.*60/i).first().waitFor();
});
await step("review: your answer, correct answer, explanation for each question; filter incorrect", async () => {
  const review = s.locator("#review"); await review.getByText("Explanation").first().waitFor();
  assert((await review.locator("article").count()) === 8, "8 review cards");
  assert((await review.getByText("Your answer").count()) >= 7, "your answer labels"); assert((await review.getByText("Correct answer").count()) === 8, "correct answer labels");
  await review.getByRole("button", { name: "Incorrect" }).click(); assert((await review.locator("article").count()) === 3, "incorrect filter count (2 wrong + 1 skipped)");
});
await step("retake is offered while attempts remain; attempts history appears after the second attempt", async () => {
  await s.getByRole("link", { name: /Retake/i }).waitFor();
  await a.goto("/admin/tests"); await a.getByRole("button", { name: /^Edit: Stakeholders — topic test$/ }).click(); await a.locator("#f-attemptsAllowed").fill("2"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await takeTest(s, { all: "wrong" }); await s.getByText(/NOT PASSED|Not passed/i).first().waitFor(); await s.getByText("0%").first().waitFor();
  assert((await s.getByRole("link", { name: /Retake/i }).count()) === 0, "retake offered with no attempts left"); await s.locator("[data-attempts-note]").getByText("No attempts left for this test.").waitFor();
  await s.getByRole("heading", { name: "Your attempts" }).waitFor(); assert((await s.getByRole("link", { name: /Attempt \d/ }).count()) === 2, "history rows");
  await s.getByRole("link", { name: "Attempt 1" }).click(); await s.getByText("63%").first().waitFor();
});
await step("review answers are only reachable by their owner (another student gets no result)", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/register"); await p.locator("#reg-name").fill("Res Tester"); await p.locator("#reg-email").fill(`res.${Date.now()}@example.com`);
  await p.locator("#reg-password").fill("Res-pass12345"); await p.locator("#reg-confirm").fill("Res-pass12345"); await p.locator("#reg-terms").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard$/);
  const url = s.url(); await p.goto(url.replace(BASE, "")); assert(!(await p.content()).includes("63%"), "another student sees someone else's result"); await c.close();
});

// ---- progress = materials + test results (fresh student, nothing seeded) ----
const pc = await ctx(); const p = await pc.newPage();
await step("progress: completing all materials of a topic counts 50 %, the test the other 50 %", async () => {
  await p.goto("/register"); await p.locator("#reg-name").fill("Prog Tester"); await p.locator("#reg-email").fill(`prog.${Date.now()}@example.com`);
  await p.locator("#reg-password").fill("Prog-pass12345"); await p.locator("#reg-confirm").fill("Prog-pass12345"); await p.locator("#reg-terms").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard$/);
  await p.goto("/courses"); await p.getByRole("button", { name: "Enroll (free in demo)" }).first().click(); await p.getByText("Enrolled").first().waitFor();
  await p.goto("/subject/bt"); await p.getByRole("link", { name: /Business organisations and their stakeholders/ }).first().waitFor();
  for (const x of ["notes", "video", "pdf", "audio", "diagram", "glossary", "summary"]) { await p.goto(mat(x)); await p.getByRole("button", { name: "Mark as completed" }).click(); await p.getByRole("button", { name: "Completed" }).waitFor(); }
  await p.goto(`/subject/bt/topic/${T1}`); await p.getByText("7 of 7 completed").waitFor();
  await p.goto("/subject/bt"); await p.getByText(/\b50%/).first().waitFor();
});
await step("progress: passing the topic test completes the topic (100 %) and unlocks the next one", async () => {
  await takeTest(p, {}); await p.getByText("100%").first().waitFor(); await p.getByText(/PASSED|Passed/).first().waitFor();
  await p.goto("/subject/bt"); await p.getByText(/Completed|100%/).first().waitFor();
  await p.goto("/subject/bt/topic/bt-business-environment"); await p.getByRole("heading", { level: 1, name: "Business environment" }).waitFor(); // locked topics show an empty state instead
});
await step("dashboard shows the real progress and the test result", async () => {
  await p.goto("/dashboard"); await p.getByText(/Stakeholders — topic test/).first().waitFor(); await p.getByText(/100%/).first().waitFor();
});
await step("mobile 360/390: result page, score card, review and history fit the screen", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await sc.storageState() }); const m = await c.newPage();
    await m.goto(s.url().replace(BASE, "")); await m.getByText("63%").first().waitFor(); await m.waitForTimeout(300);
    assert((await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`);
    await c.close();
  }
});
await ac.close(); await sc.close(); await pc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
