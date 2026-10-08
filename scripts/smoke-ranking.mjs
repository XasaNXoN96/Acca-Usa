// Smoke test: student ranking. BASE_URL=... CHROMIUM=... node scripts/smoke-ranking.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T = "bt-stakeholders-test";
const RIGHT = { "Which best describes": "Any individual or group affected by, or able to affect, the organisation", "A shareholder is": "Owns shares in the company", "INTERNAL stakeholder": "Employees", "main objective": "Maximise long-term shareholder wealth", "not-for-profit": "Its surplus is reinvested in its mission rather than distributed to owners", "Mendelow": "Managed closely", "Shareholders want higher dividends": "Stakeholder conflict", "Corporate social responsibility": "Have wider responsibilities to society and the environment" };
async function takeTest(p, correct) {
  await p.goto(`/test/${T}`); await p.getByRole("button", { name: /Start test|Resume test/ }).click(); await p.getByText("Question 1 of 8").waitFor();
  for (let i = 0; i < 8; i++) {
    await p.getByText(`Question ${i + 1} of 8`).waitFor(); const q = await p.locator("h2").first().innerText(); const key = Object.keys(RIGHT).find((k) => q.includes(k));
    if (correct) await p.getByRole("radio").filter({ hasText: RIGHT[key].slice(0, 40) }).first().click(); else { const wrong = await p.getByRole("radio").evaluateAll((els, r) => els.map((e) => e.textContent).find((t) => !t.includes(r)), RIGHT[key].slice(0, 20)); await p.getByRole("radio").filter({ hasText: wrong.slice(0, 30) }).first().click(); }
    if (i < 7) await p.getByRole("button", { name: "Next", exact: true }).click();
  }
  await p.getByRole("button", { name: "Submit test" }).first().click(); await p.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await p.waitForURL(/result/);
}
const rows = async (p) => p.locator("table tbody tr").allInnerTexts();

const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
await step("ranking: real demo students only, own place highlighted, other learners abbreviated, no emails / full surnames / suspended users", async () => {
  await s.goto("/ranking"); await s.locator("[data-my-rank]").waitFor(); await s.getByText(/Your position: #\d+ of \d+/).waitFor();
  const html = await s.content(); for (const leak of ["aziza@", "daniil@", "maria@", "jasur@", "Karimova", "Sokolov", "Lopez", "Rahimov", "Omar Haddad", "Chen Wei"]) assert(!html.includes(leak), `leak: ${leak}`);
  const r = await rows(s); assert(r.some((x) => /Demo Student/.test(x) && /You/.test(x)), "own row"); assert(r.some((x) => /Aziza K\./.test(x)) && r.some((x) => /Daniil S\./.test(x)) && r.some((x) => /Maria L\./.test(x)), "abbreviated names");
  assert(!r.some((x) => /Jasur/.test(x)), "suspended student ranked"); assert(r.length <= 8, `too many rows ${r.length} (no fake crowds)`);
  for (const col of ["Rank", "Student", "Score", "Tests", "Progress"]) await s.getByRole("columnheader", { name: col }).waitFor();
});
const bc = await ctx(); const b = await bc.newPage();
await step("scores come from real test results: better result ranks higher; ties share a rank", async () => {
  await b.goto("/register"); await b.locator("#reg-name").fill("Zed Ranker"); await b.locator("#reg-email").fill(`rk.${Date.now()}@example.com`); await b.locator("#reg-password").fill("Rank-pass12345"); await b.locator("#reg-confirm").fill("Rank-pass12345"); await b.locator("#reg-terms").click(); await b.getByRole("button", { name: "Create account" }).click(); await b.waitForURL(/dashboard$/);
  await b.goto("/courses"); await b.getByRole("button", { name: "Enroll (free in demo)" }).first().click(); await b.getByText("Enrolled").first().waitFor();
  await takeTest(s, true); await takeTest(b, false);
  await s.goto("/ranking"); let r = await rows(s); const demoRow = r.find((x) => /Demo Student/.test(x)); const zed = r.find((x) => /Zed R\./.test(x));
  assert(/#1(?!\d)/.test(demoRow) && /100/.test(demoRow), `demo row ${demoRow}`); assert(zed && /\b0\b/.test(zed), `zed row ${zed}`);
  await b.goto("/ranking"); await b.getByText(/Your position: #\d+ of \d+/).waitFor(); r = await rows(b); assert(r.some((x) => /Zed Ranker/.test(x) && /You/.test(x)), "own full name shown to the owner");
  const ties = r.filter((x) => /#\d+/.test(x)).map((x) => /#(\d+)/.exec(x)[1]); assert(new Set(ties).size < ties.length || ties.length <= 2, "ties should share a rank");
});
await step("filters: platform / subject; FIA has nobody enrolled; invalid parameters are ignored", async () => {
  await s.goto("/ranking?platform=fia"); await s.getByText("No learners to rank yet.").waitFor(); await s.locator("[data-my-rank-empty]").waitFor();
  await s.goto("/ranking?platform=acca&subject=bt"); await s.locator("[data-my-rank]").waitFor(); assert((await rows(s)).some((x) => /Demo Student/.test(x)), "bt filter");
  await s.goto("/ranking?platform=cima&subject=../../x"); await s.locator("[data-my-rank]").waitFor(); // falls back to overall
  await s.goto("/ranking"); await s.locator("#rk-platform").selectOption({ label: "FIA" }); await s.getByRole("button", { name: "Apply" }).click(); await s.waitForURL(/platform=fia/); await s.getByText("No learners to rank yet.").waitFor();
});
await step("dashboard ranking preview lists the same real learners (and always the current user)", async () => {
  await s.goto("/dashboard"); await s.locator("li[aria-current=true]").getByText("Demo Student").waitFor(); await s.getByText("Aziza K.").first().waitFor(); assert(!(await s.content()).includes("Karimova"), "surname on dashboard");
});
await step("mobile 360/390: filters, own position and ranking cards fit the screen", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await sc.storageState() }); const p = await c.newPage(); await p.goto("/ranking"); await p.locator("[data-my-rank]").waitFor(); await p.waitForTimeout(300);
    assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`);
    for (const sel of ["#rk-platform", "#rk-subject"]) { const bb = await p.locator(sel).boundingBox(); assert(bb.height >= 40 && bb.x + bb.width <= w, `${w}: ${sel}`); }
    await c.close();
  }
});
await step("RU / UZ ranking strings", async () => {
  for (const [loc, marks] of [["ru", ["Ваше место", "Применить"]], ["uz", ["Sizning o‘rningiz", "Qo‘llash"]]]) {
    const c = await browser.newContext({ baseURL: BASE, storageState: await sc.storageState() }); await c.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]); const p = await c.newPage(); await p.goto("/ranking");
    for (const m of marks) await p.getByText(m).first().waitFor().catch(() => { throw new Error(`${loc}: "${m}" missing`); }); await c.close();
  }
});
await sc.close(); await bc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
