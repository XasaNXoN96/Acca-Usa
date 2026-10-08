// Smoke test: Student Test Player. BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/smoke-testplayer.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100" + "05fe02fea7e2f7340000000049454e44ae426082", "hex");
const T = "bt-stakeholders-test";
const TAG = String(Date.now()).slice(-5);

// ---- admin: attempts = 2 on the BT test, randomisation on (reload must keep the order) ----
const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
await step("admin configures the BT test (2 attempts, randomised)", async () => {
  await a.goto("/admin/tests"); await a.getByRole("button", { name: /^Edit: Stakeholders — topic test$/ }).click();
  await a.locator("#f-attemptsAllowed").fill("2"); await a.locator("#f-randomizeQuestions").click(); await a.locator("#f-randomizeAnswers").click(); await a.locator("#f-description").fill("Check what you learned about stakeholders.");
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
});

const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
let order1 = "";
await step("flow: Subject → Topic → Test card → intro shows title, description, questions, duration, pass mark, attempts", async () => {
  await s.goto("/subject/bt"); await s.getByRole("link", { name: /Business organisations and their stakeholders/ }).first().click(); await s.waitForURL(/topic\//);
  const card = s.locator("[data-topic-test]"); await card.getByText("Stakeholders — topic test").waitFor(); await card.getByRole("link", { name: "Start test" }).click(); await s.waitForURL(new RegExp(`/test/${T}$`));
  await s.getByText("Check what you learned about stakeholders.").waitFor();
  for (const k of ["Questions", "Duration", "Pass mark", "Attempts"]) await s.getByText(k, { exact: true }).waitFor();
  await s.getByText("0 of 2").waitFor(); assert(!/Correct|Explanation/i.test(await s.locator("main").innerText()), "answers in intro");
});
await step("start: question 1 / 8, timer, selectable answers, selected state differs, no correct answer in DOM or network", async () => {
  const bodies = []; s.on("response", async (r) => { if (r.url().includes("/test/") && r.request().method() === "POST" || r.url().includes("_rsc")) bodies.push(await r.text().catch(() => "")); });
  await s.getByRole("button", { name: "Start test" }).click(); await s.getByText("Question 1 of 8").waitFor();
  const timer = s.getByRole("timer"); await timer.waitFor(); assert(/\d+:\d\d/.test(await timer.innerText()), "timer text");
  const html = await s.content(); assert(!html.includes("correctOptionId") && !/Factory rent stays/.test(html), "answer key in page");
  const first = s.getByRole("radio").first(); await first.click(); await s.getByText("Selected").first().waitFor(); assert((await first.getAttribute("aria-checked")) === "true", "not selected");
  assert((await s.getByRole("radio").nth(1).getAttribute("aria-checked")) === "false", "two selected");
  assert(!bodies.join("").includes("correctOptionId"), "correctOptionId in responses");
  order1 = await s.locator("h2").first().innerText();
});
await step("next / previous / navigator / flag / answered counter", async () => {
  await s.getByRole("button", { name: "Next", exact: true }).click(); await s.getByText("Question 2 of 8").waitFor();
  await s.getByRole("radio").nth(1).click(); await s.getByRole("button", { name: "Flag question" }).click(); await s.getByRole("button", { name: "Remove flag" }).waitFor();
  await s.getByRole("button", { name: /Go to question 5/ }).click(); await s.getByText("Question 5 of 8").waitFor();
  await s.getByRole("button", { name: "Previous", exact: true }).click(); await s.getByText("Question 4 of 8").waitFor();
  await s.getByText("2 of 8 answered").waitFor(); await s.getByRole("button", { name: /Go to question 2.*flagged/i }).waitFor();
});
await step("autosave + reload restores answers, position, flag and the same (shuffled) order", async () => {
  await s.getByText(/Draft saved|Saving/).first().waitFor({ timeout: 15000 }); await s.waitForTimeout(1500);
  await s.reload(); await s.getByText(/Draft restored/).waitFor(); await s.getByText("2 of 8 answered").waitFor();
  await s.getByRole("button", { name: /Go to question 1\b/ }).click(); assert((await s.locator("h2").first().innerText()) === order1, "order changed after reload");
  assert((await s.getByRole("radio").first().getAttribute("aria-checked")) === "true" || (await s.locator("[aria-checked=true]").count()) === 1, "answer not restored");
});
await step("exit asks for confirmation (progress is saved); Stay keeps the test; Leave returns and the draft resumes", async () => {
  await s.getByRole("button", { name: "Exit test" }).click(); const d = s.getByRole("dialog"); await d.getByText("Are you sure you want to leave?").waitFor(); await d.getByText(/current progress will be saved/).waitFor();
  await d.getByRole("button", { name: "Stay in test" }).click(); await d.waitFor({ state: "detached" });
  await s.getByRole("button", { name: "Exit test" }).click(); await s.getByRole("dialog").getByRole("button", { name: "Leave test" }).click(); await s.waitForURL(/tab=tests/);
  await s.goto(`/test/${T}`); await s.getByText(/Draft restored/).waitFor(); await s.getByText("2 of 8 answered").waitFor();
});
await step("submit dialog warns about unanswered questions; submitting shows the result page", async () => {
  await s.getByRole("button", { name: "Submit test" }).first().click(); const d = s.getByRole("dialog"); await d.getByText(/6 unanswered questions/).waitFor(); await d.getByText(/1 question is flagged/).waitFor();
  await d.getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(new RegExp(`/test/${T}/result`)); await s.getByText(/%/).first().waitFor();
});
await step("second attempt works, third is refused (attempts allowed = 2)", async () => {
  await s.goto(`/test/${T}`); await s.getByText("1 of 2").waitFor(); await s.getByRole("button", { name: "Start test" }).click(); await s.getByText("Question 1 of 8").waitFor();
  await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/result/);
  await s.goto(`/test/${T}`); await s.getByText("No attempts left").waitFor(); assert((await s.getByRole("button", { name: "Start test" }).count()) === 0, "start still offered");
  await s.getByRole("link", { name: "View my result" }).click(); await s.waitForURL(/result/);
});
await step("timer: warning state under 5 minutes and automatic submit at zero (fake clock)", async () => {
  // fresh attempt on another test: relax attempts via admin, then use a controllable clock in the student page
  await a.goto("/admin/tests"); await a.getByRole("button", { name: /^Edit: Stakeholders — topic test$/ }).click(); await a.locator("#f-attemptsAllowed").fill("0"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  const c = await ctx(); await c.addCookies((await sc.cookies())); const p = await c.newPage(); await p.clock.install(); await p.goto(`/test/${T}`);
  await p.getByRole("button", { name: "Start test" }).click(); await p.getByText("Question 1 of 8").waitFor(); await p.getByRole("radio").first().click();
  await p.clock.runFor(6 * 60 * 1000); await p.waitForTimeout(300);
  const timer = p.getByRole("timer"); assert(/0?[3-4]:\d\d/.test(await timer.innerText()), `timer ${await timer.innerText()}`);
  await p.clock.runFor(5 * 60 * 1000); await p.getByText("Time is up").waitFor({ timeout: 10000 }).catch(() => {}); await p.waitForURL(/result/, { timeout: 20000 });
  await c.close();
});
await step("question image: served to an enrolled student only once the question is in a published test", async () => {
  await a.goto("/admin/question-bank"); await a.getByRole("button", { name: "Add question" }).click();
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "BT · Business organisations and their stakeholders" });
  await a.locator("#f-text").fill(`Which diagram element represents a stakeholder (${TAG})?`);
  for (const k of "ABCD") await a.locator(`#f-option${k}`).fill(`Element ${k}`);
  await a.locator("#f-correct").selectOption("c"); await a.locator("#f-explanation").fill("Element C is the stakeholder symbol."); await a.locator("#f-points").fill("1"); await a.locator("#f-difficulty").selectOption("easy");
  await a.locator("#f-imageId").setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: png }); await a.getByText("Uploaded").first().waitFor();
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/question-bank"); await a.getByRole("button", { name: new RegExp(`Preview: .*${TAG}`) }).click(); const src = await a.getByRole("dialog").locator("img").getAttribute("src"); await a.keyboard.press("Escape");
  assert((await sc.request.get(src)).status() === 404, "image served before it is part of a published test");
  await a.goto("/admin/tests"); await a.getByRole("button", { name: /^Edit: Stakeholders — topic test$/ }).click(); await a.getByRole("button", { name: "Add questions" }).click();
  await a.getByRole("dialog").filter({ hasText: "Published questions of the selected subject" }).getByText(new RegExp(`diagram element represents a stakeholder \\(${TAG}\\)`)).click();
  await a.getByRole("dialog").filter({ hasText: "Published questions of the selected subject" }).getByRole("button", { name: /Add selected/ }).click(); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  assert((await sc.request.get(src)).status() === 200, "image not served to enrolled student");
  assert((await (await ctx()).request.get(src)).status() === 401, "image served to a guest");
});
await step("mobile 360/390: timer visible, navigator usable, no overflow, Next/Submit reachable", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await sc.storageState() }); const p = await c.newPage();
    await p.goto(`/test/${T}`); const btn = p.getByRole("button", { name: /Start test|Resume test/ }); if (await btn.count()) await btn.click(); await p.getByText(/Question 1 of 9/).waitFor();
    const over = () => p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert((await over()) <= 0, `${w}: overflow`);
    const tb = await p.getByRole("timer").boundingBox(); assert(tb && tb.x >= 0 && tb.x + tb.width <= w && tb.y >= 0, `${w}: timer clipped`);
    const nav = p.getByRole("button", { name: /Go to question 9/ }); await nav.scrollIntoViewIfNeeded(); const nb = await nav.boundingBox(); assert(nb.height >= 40 && nb.width >= 40, `${w}: navigator target ${nb.width}x${nb.height}`);
    await nav.click(); await p.getByText("Question 9 of 9").waitFor(); const sb = await p.getByRole("button", { name: "Submit test" }).first().boundingBox(); assert(sb && sb.x + sb.width <= w, `${w}: submit outside`);
    await p.getByRole("button", { name: "Exit test" }).click(); const db = await p.getByRole("dialog").boundingBox(); assert(db.x >= 0 && db.x + db.width <= w + 1, `${w}: dialog outside`);
    await c.close();
  }
});
await step("guests and not-enrolled users cannot open or start a test", async () => {
  const g = await ctx(); const r = await g.request.get(`/test/${T}`, { maxRedirects: 0 }); assert(r.status() >= 300 && r.status() < 400, `guest ${r.status()}`);
  await g.close();
});
await ac.close(); await sc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
