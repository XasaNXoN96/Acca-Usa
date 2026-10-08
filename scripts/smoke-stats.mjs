// Smoke test: admin statistics. BASE_URL=... CHROMIUM=... node scripts/smoke-stats.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const cards = async (p) => Object.fromEntries(await p.locator("[data-stats-cards] > div").evaluateAll((els) => els.map((e) => { const parts = e.innerText.split("\n").map((x) => x.trim()).filter(Boolean); return [parts[1] ?? "", parts[0] ?? ""]; })));
const rowsCount = async (p, path) => { await p.goto(path); await p.getByRole("heading", { level: 1 }).waitFor(); const txt = await p.getByText(/^\d+ records?$/).first().innerText(); return parseInt(txt); };

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
await step("fresh data: attempts / pass rate / average show 0 and — with empty states (nothing invented)", async () => {
  await a.goto("/admin/statistics"); await a.locator("[data-stats-cards]").waitFor(); const c = await cards(a);
  assert(c["Test attempts"] === "0", `attempts ${c["Test attempts"]}`); assert(c["Pass rate"] === "—" && c["Average score"] === "—", "rates should be —"); assert(c["Completed materials"] === "0", "materials");
  await a.getByText("No test attempts in this period.").first().waitFor();
});
await step("totals match the admin lists (students, subjects, topics, materials, tests)", async () => {
  const c = await cards(a);
  await a.goto("/admin/students"); await a.locator("#flt-role").selectOption({ label: "Student" }); const students = parseInt(await a.getByText(/^\d+ records?$/).first().innerText());
  assert(Number(c["Students"]) === students, `students ${c["Students"]} vs ${students}`);
  assert(Number(c["Subjects"]) === (await rowsCount(a, "/admin/subjects")), "subjects"); assert(Number(c["Topics"]) === (await rowsCount(a, "/admin/topics")), "topics");
  assert(Number(c["Materials"]) === (await rowsCount(a, "/admin/materials")), "materials"); assert(Number(c["Tests"]) === (await rowsCount(a, "/admin/tests")), "tests");
});

// ---- real activity: the demo student takes a test and completes a material ----
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
const T1 = "bt-business-organisations-and-their-stakeholders";
await s.goto(`/subject/bt/topic/${T1}/material/${T1}-notes`); await s.getByRole("button", { name: "Mark as completed" }).click(); await s.getByRole("button", { name: "Completed" }).waitFor();
await s.goto("/test/bt-stakeholders-test"); await s.getByRole("button", { name: "Start test" }).click(); await s.getByText("Question 1 of 8").waitFor();
await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/result/);

await step("statistics reflect the real activity: 1 attempt, 0% pass rate / average, 1 completed material, active student", async () => {
  await a.goto("/admin/statistics"); const c = await cards(a);
  assert(c["Test attempts"] === "1", `attempts ${c["Test attempts"]}`); assert(c["Pass rate"] === "0%" && c["Average score"] === "0%", "rates"); assert(c["Completed materials"] === "1", "completed materials"); assert(Number(c["Active students"]) >= 1, "active students");
  await a.locator("[data-chart=tests]").getByText(/Stakeholders — topic test/).waitFor(); await a.locator("[data-chart=passfail]").getByText("Not passed").waitFor(); await a.locator("[data-chart=activity] [role=img]").waitFor(); await a.locator("[data-chart=subjects]").getByText(/ACCA · BT/).waitFor();
});
await step("filters: platform / subject / period change the numbers; invalid parameters fall back safely", async () => {
  const go = async (q) => { await a.goto(`/admin/statistics${q}`); await a.locator("[data-stats-cards]").waitFor(); return cards(a); };
  let c = await go("?platform=fia"); assert(c["Subjects"] === "3" && c["Test attempts"] === "0" && c["Students"] === "0", `fia ${JSON.stringify(c)}`);
  c = await go("?subject=bt"); assert(c["Test attempts"] === "1" && c["Subjects"] === "1", "subject bt");
  c = await go("?subject=ma"); assert(c["Test attempts"] === "0", "subject ma");
  c = await go("?range=custom&from=2020-01-01&to=2020-01-31"); assert(c["Test attempts"] === "0" && c["Completed materials"] === "0", "past range"); await a.getByText("Period: 2020-01-01 – 2020-01-31").waitFor();
  c = await go("?range=custom&from=garbage&to=nope&platform=cima&subject=../../etc"); assert(c["Test attempts"] === "1", "invalid params should fall back to defaults"); await a.getByText(/Period:/).waitFor();
  c = await go("?range=7"); assert(c["Test attempts"] === "1", "7 days");
  await a.goto("/admin/statistics"); await a.locator("#st-platform").selectOption({ label: "FIA" }); await a.getByRole("button", { name: "Apply" }).click(); await a.waitForURL(/platform=fia/); c = await cards(a); assert(c["Test attempts"] === "0", "form submit");
});
await step("access: students and guests cannot open statistics", async () => {
  assert((await sc.request.get("/admin/statistics", { maxRedirects: 0 })).status() !== 200, "student reached statistics");
  const g = await ctx(); assert((await g.request.get("/admin/statistics", { maxRedirects: 0 })).status() !== 200, "guest reached statistics"); await g.close();
});
await step("mobile 360/390 + tablet: cards, filters and charts fit; filter controls are touch-sized", async () => {
  for (const w of [360, 390, 412, 768, 1024]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: w < 1024, storageState: await ac.storageState() }); const p = await c.newPage(); await p.goto("/admin/statistics"); await p.locator("[data-stats-cards]").waitFor(); await p.waitForTimeout(300);
    assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`);
    for (const sel of ["#st-platform", "#st-subject", "#st-range", "#st-from", "#st-to"]) { const b = await p.locator(sel).boundingBox(); assert(b.height >= 40 && b.x >= 0 && b.x + b.width <= w, `${w}: ${sel} ${b.width}x${b.height}`); }
    await c.close();
  }
});
await step("RU / UZ statistics strings", async () => {
  for (const [loc, marks] of [["ru", ["Активные студенты", "Результаты тестов", "Применить"]], ["uz", ["Faol talabalar", "Test natijalari", "Qo‘llash"]]]) {
    const c = await browser.newContext({ baseURL: BASE, storageState: await ac.storageState() }); await c.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]); const p = await c.newPage(); await p.goto("/admin/statistics");
    for (const m of marks) await p.getByText(m).first().waitFor().catch(() => { throw new Error(`${loc}: "${m}" missing`); }); await c.close();
  }
});
await ac.close(); await sc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
