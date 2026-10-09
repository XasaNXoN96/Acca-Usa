// Smoke test: student dashboard integration. BASE_URL=... CHROMIUM=... node scripts/smoke-dashboard.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T4 = "bt-governance-ethics-and-sustainability";

// ---- brand-new student: nothing enrolled → honest empty states, zeros, no invented numbers ----
const nc = await ctx(); const n = await nc.newPage();
await step("new student: empty states, zero stats, no fake data", async () => {
  await n.goto("/register"); await n.locator("#reg-name").fill("Dash Tester"); await n.locator("#reg-email").fill(`dash.${Date.now()}@example.com`);
  await n.locator("#reg-password").fill("Dash-pass12345"); await n.locator("#reg-confirm").fill("Dash-pass12345"); await n.locator("#reg-terms").click(); await n.locator("#reg-privacy").click(); await n.getByRole("button", { name: "Create account" }).click(); await n.waitForURL(/dashboard$/);
  await n.getByText("Enroll in a platform to see your progress by subject.").waitFor(); await n.getByText("No results yet").first().waitFor();
  assert((await n.locator("[data-continue-material]").count()) === 0, "continue card without activity"); assert((await n.locator("[data-subject-progress]").count()) === 0, "subject progress without enrolment");
  const stats = await n.locator("main").innerText(); assert(/Subjects\s*\n?\s*0|0\s*\n\s*Subjects/i.test(stats) || /\b0\b/.test(stats), "zero stats");
});
await nc.close();

// ---- demo student ----
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
await step("dashboard: platforms, subjects, overall progress, completed topics, learning time, my tests / results / progress", async () => {
  for (const k of ["Enrolled courses", "Subjects", "Completed topics", "Learning time", "Overall progress"]) await s.getByText(new RegExp(k, "i")).first().waitFor().catch(() => { throw new Error(`stat "${k}" missing`); });
  const links = await s.locator("[data-my-learning] a").evaluateAll((els) => els.map((e) => e.getAttribute("href"))); assert(JSON.stringify(links) === JSON.stringify(["/exams", "/progress#test-results", "/progress"]), `links ${links}`);
  await s.getByText("My tests").first().waitFor(); await s.getByText("My results").first().waitFor(); await s.getByText("My progress").first().waitFor();
});
await step("progress by subject lists the enrolled subjects with real percentages and topic counts", async () => {
  const list = s.locator("[data-subject-progress]"); await list.waitFor(); const text = await list.innerText();
  assert(/ACCA · BT/.test(text) && /ACCA · MA/.test(text), "BT / MA missing"); assert(/\d+ of \d+ topics completed/.test(text), "topic counts");
  assert(!/FIA/.test(text), "FIA shown although not enrolled");
  const pcts = (text.match(/(\d+)%/g) ?? []).map((x) => parseInt(x)); assert(pcts.length >= 2 && pcts.every((p) => p >= 0 && p <= 100), "percentages");
});
await step("Continue learning: opening a material makes it the continue target (ACCA · BT · Topic N · Material M)", async () => {
  await s.goto(`/subject/bt/topic/${T4}/material/${T4}-notes`); await s.getByRole("heading", { level: 1 }).waitFor(); await s.waitForTimeout(800);
  await s.goto("/dashboard"); const card = s.locator("[data-continue-material]"); await card.waitFor();
  await card.getByText(/ACCA · BT · Topic 4 · Material 1/).waitFor(); await card.getByRole("link", { name: "Continue" }).click(); await s.waitForURL(new RegExp(`${T4}/material/${T4}-notes$`));
});
await step("recent test result appears with real score; available tests list updates", async () => {
  await s.goto("/test/bt-stakeholders-test"); await s.getByRole("button", { name: /Start test|Resume test/ }).click(); await s.getByText("Question 1 of 8").waitFor();
  await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/result/);
  await s.goto("/dashboard"); await s.getByText("0% · Not passed").first().waitFor(); await s.getByText("Recent test results").first().waitFor();
});
await step("numbers are stable between loads (nothing random) and match the subject page", async () => {
  const grab = async () => (await s.waitForLoadState("networkidle"), await s.locator("[data-subject-progress]").innerText()).replace(/\s+/g, " "); await s.goto("/dashboard"); const a = await grab(); await s.goto("/dashboard"); const b = await grab(); assert(a === b, "dashboard values changed between loads");
  const bt = /BT[^%]*?(\d+)%/.exec(a)?.[1]; await s.goto("/subject/bt"); await s.getByText(new RegExp(`\\b${bt}%`)).first().waitFor();
});
await step("mobile 360/390: continue first, no overflow, links reachable", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await sc.storageState() }); const m = await c.newPage(); await m.goto("/dashboard"); await m.locator("[data-continue-material]").waitFor();
    assert((await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`);
    const cb = await m.locator("[data-continue-material]").boundingBox(); const mb = await m.locator("[data-my-learning]").boundingBox(); assert(cb.y > 0 && mb.y < cb.y + 800, `${w}: layout`);
    for (const a of await m.locator("[data-my-learning] a").all()) { const b = await a.boundingBox(); assert(b.height >= 44 && b.x + b.width <= w, `${w}: link size`); }
    await c.close();
  }
});
await step("RU / UZ dashboard strings", async () => {
  for (const [loc, who, marks] of [["ru", "Студент", ["Мои тесты", "Прогресс по предметам", "Продолжить"]], ["uz", "Talaba", ["Mening testlarim", "Fanlar bo‘yicha progress", "Davom etish"]]]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, storageState: await sc.storageState() }); await c.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]); const p = await c.newPage(); await p.goto("/dashboard");
    for (const m of marks) await p.getByText(m).first().waitFor().catch(() => { throw new Error(`${loc}: "${m}" missing`); }); void who; await c.close();
  }
});
await sc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
