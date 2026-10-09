// Smoke test: review of mistakes + practice, from REAL attempts. (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0], String(e.stack).split("\n").find((l) => l.includes("smoke-mistakes")) ?? ""); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T = "bt-stakeholders-test";
const RIGHT = { "Which best describes": "Any individual or group affected by, or able to affect, the organisation", "A shareholder is": "Owns shares in the company", "INTERNAL stakeholder": "Employees", "main objective": "Maximise long-term shareholder wealth", "not-for-profit": "Its surplus is reinvested in its mission rather than distributed to owners", "Mendelow": "Managed closely", "Shareholders want higher dividends": "Stakeholder conflict", "Corporate social responsibility": "Have wider responsibilities to society and the environment" };
const WRONG = { "Which best describes": "Only the owners of the company", "Mendelow": "Monitored only" };

async function takeTest(p, { wrong = [], skip = [] }) {
  await p.goto(`/test/${T}`); await p.getByRole("button", { name: /Start test|Resume test/ }).click(); await p.getByText(/Question 1 of 8/).waitFor();
  for (let i = 0; i < 8; i++) {
    await p.getByText(`Question ${i + 1} of 8`).waitFor(); const q = await p.locator("h2").first().innerText();
    const key = Object.keys(RIGHT).find((k) => q.includes(k)); assert(key, `unknown question ${q}`);
    const idx = Object.keys(RIGHT).indexOf(key);
    if (!skip.includes(idx)) {
      const text = wrong.includes(idx) ? (WRONG[key] ?? (await p.getByRole("radio").evaluateAll((els, r) => els.map((e) => e.textContent).find((t) => !t.includes(r)), RIGHT[key]))) : RIGHT[key];
      await p.getByRole("radio").filter({ hasText: text.slice(0, 40) }).first().click();
    }
    if (i < 7) await p.getByRole("button", { name: "Next", exact: true }).click();
  }
  await p.getByRole("button", { name: "Submit test" }).first().click(); await p.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await p.waitForURL(/result/);
}

const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);

await step("before any submitted test there are no mistakes (nothing invented)", async () => {
  await s.goto("/mistakes"); await s.getByText("No mistakes yet").waitFor();
  assert((await s.locator("[data-mistake]").count()) === 0, "mistakes shown without attempts");
  assert((await s.getByRole("link", { name: /Practise/ }).count()) === 0, "practice offered without mistakes");
});

await step("after a test with 2 wrong + 1 skipped answer: exactly those 3 questions are listed with the correct answer and the real explanation", async () => {
  await takeTest(s, { wrong: [0, 5], skip: [7] });
  assert(await s.getByRole("link", { name: "Review all my mistakes" }).isVisible(), "result page has no link to mistakes");
  await s.getByRole("link", { name: "Review all my mistakes" }).click(); await s.waitForURL(/\/mistakes$/);
  await s.locator("[data-mistake]").first().waitFor(); assert((await s.locator("[data-mistake]").count()) === 3, `mistakes ${await s.locator("[data-mistake]").count()}`);
  const first = s.locator("[data-mistake]", { hasText: "Which best describes" });
  await first.getByText("Correct answer", { exact: true }).waitFor(); assert(/Any individual or group affected by/.test(await first.innerText()), "correct answer missing");
  assert((await first.locator("[data-explanation]").count()) === 1, "the stored explanation is not shown");
  await first.getByText("Your answer", { exact: true }).waitFor();
  const skipped = s.locator("[data-mistake]", { hasText: "Corporate social responsibility" }); await skipped.getByText("You skipped this question.").waitFor();
  assert((await s.locator("[data-mistake]").filter({ hasText: "INTERNAL stakeholder" }).count()) === 0, "a correctly answered question is listed");
});

await step("practice: server grades each answer; the page never carries the answer key; wrong answer shows the correct one", async () => {
  await s.goto("/mistakes"); await s.getByRole("link", { name: "Practise 3 mistakes" }).click(); await s.waitForURL(/\/mistakes\/practice/);
  await s.locator("[data-practice]").waitFor();
  const html = await s.content(); assert(!html.includes("correctOptionId"), "answer key in the page");
  // first question: deliberately wrong
  const firstQ = await s.locator("legend").innerText();
  const wrongPick = firstQ.includes("Which best describes") ? "Only the owners of the company" : firstQ.includes("Mendelow") ? "Monitored only" : null;
  if (wrongPick) await s.getByRole("radio", { name: wrongPick }).click(); else await s.getByRole("radio").first().click();
  await s.getByRole("button", { name: "Check answer" }).click(); await s.locator("[data-practice-feedback]").waitFor();
  const firstState = await s.locator("[data-practice-feedback]").getAttribute("data-practice-feedback");
  if (firstState === "wrong") await s.getByText(/Correct answer:/).waitFor();
  // remaining questions: right answers
  for (let i = 0; i < 2; i++) {
    await s.getByRole("button", { name: /Next question|Finish/ }).click();
    const q = await s.locator("legend").innerText(); const key = Object.keys(RIGHT).find((k) => q.includes(k));
    await s.getByRole("radio", { name: RIGHT[key] }).click(); await s.getByRole("button", { name: "Check answer" }).click();
    await s.locator("[data-practice-feedback='correct']").waitFor();
  }
  await s.getByRole("button", { name: "Finish" }).click(); await s.locator("[data-practice-done]").waitFor();
  const expected = firstState === "correct" ? 3 : 2; await s.getByText(`${expected} of 3 correct`).waitFor();
});

await step("practice resolves mistakes: correctly practised questions leave the 'needs practice' list but stay under 'everything'", async () => {
  await s.goto("/mistakes"); const open = await s.locator("[data-mistake]").count(); assert(open <= 1, `open mistakes ${open}`);
  await s.goto("/mistakes?show=all"); assert((await s.locator("[data-mistake]").count()) === 3, "history lost");
  assert((await s.locator("[data-mistake][data-resolved='true']").count()) >= 2, "resolved flag missing");
});

await step("a later attempt answered correctly resolves everything; practice then has nothing to offer", async () => {
  await takeTest(s, {});
  await s.goto("/mistakes"); await s.getByText("Nothing to practise").waitFor(); assert((await s.locator("[data-mistake]").count()) === 0, "resolved mistakes still open");
  await s.goto("/mistakes/practice"); await s.getByText("Nothing to practise").waitFor();
  await s.goto("/mistakes?show=all"); assert((await s.locator("[data-mistake]").count()) === 3, "history should keep the 3 questions");
});

await step("subject filter works and mistakes of another student are not visible", async () => {
  await s.goto("/mistakes?show=all&subject=bt"); assert((await s.locator("[data-mistake]").count()) === 3, "subject filter lost items");
  await s.goto("/mistakes?show=all&subject=does-not-exist"); assert((await s.locator("[data-mistake]").count()) === 3, "unknown subject should fall back to all");
  const oc = await ctx(); const o = await oc.newPage(); await o.goto("/register");
  await o.locator("#reg-name").fill("Other Mistakes"); await o.locator("#reg-email").fill(`mist.${Date.now()}@example.com`);
  await o.locator("#reg-password").fill("Other-pass12345"); await o.locator("#reg-confirm").fill("Other-pass12345"); await o.locator("#reg-terms").click(); await o.locator("#reg-privacy").click();
  await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  await o.goto("/mistakes?show=all"); await o.getByText("No mistakes yet").waitFor(); await oc.close();
  const gc = await ctx(); const g = await gc.newPage(); await g.goto("/mistakes"); await g.waitForURL(/\/login/); await g.goto("/mistakes/practice"); await g.waitForURL(/\/login/); await gc.close();
});

await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
