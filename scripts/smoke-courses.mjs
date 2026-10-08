// Smoke test: Home → "View courses" → /all-courses → subject → topics → locked materials → modal → login next.
//   BASE_URL=http://localhost:3100 CHROMIUM=/path/to/chrome node scripts/smoke-courses.mjs   (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const over = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const c = await ctx(); const page = await c.newPage();
await step("home: 'View courses' leads to the public /all-courses (no login)", async () => {
  await page.goto("/"); await page.getByRole("link", { name: "View courses" }).first().click();
  await page.waitForURL(/\/all-courses$/); await page.getByRole("heading", { name: "All courses", level: 1 }).waitFor();
});
await step("all courses: ACCA levels + all 15 subjects, FIA subjects, NO CIMA anywhere", async () => {
  const acca = page.locator("[data-platform-section=acca]");
  for (const lvl of ["Applied Knowledge", "Applied Skills", "Strategic Professional"]) await acca.getByRole("heading", { name: lvl }).waitFor();
  assert((await acca.locator("ul > li a").count()) === 15, "ACCA should list 15 subjects");
  for (const code of ["BT", "MA", "FA", "LW", "PM", "TX", "FR", "AA", "FM", "SBL", "SBR", "AFM", "APM", "ATX", "AAA"]) await acca.getByRole("link", { name: new RegExp(`^Open ${code} — `) }).waitFor();
  assert((await page.locator("[data-platform-section=fia] ul > li a").count()) === 3, "FIA should list 3 subjects");
  assert((await page.locator("[data-platform-section]").count()) === 2, "exactly ACCA and FIA");
  assert(!/cima/i.test(await page.content()), "CIMA found on /all-courses");
});
await step("no CIMA in home, header, mega menu, mobile menu, footer, forums, /cima route", async () => {
  for (const path of ["/", "/forums", "/books", "/acca", "/fia"]) { await page.goto(path); assert(!/cima/i.test(await page.content()), `CIMA found on ${path}`); }
  const r = await page.request.get("/cima"); assert(r.status() === 404, `/cima status ${r.status()}`);
  const m = await ctx({ viewport: { width: 390, height: 800 } }); const p = await m.newPage(); await p.goto("/");
  await p.getByRole("button", { name: "Open menu" }).click(); await p.getByRole("dialog").waitFor(); assert(!/cima/i.test(await p.getByRole("dialog").innerHTML()), "CIMA in mobile menu"); await m.close();
});
await step("click BT → /subject/bt with topics; expand topic → locked materials; click material → modal", async () => {
  await page.goto("/all-courses"); await page.getByRole("link", { name: /^Open BT — / }).click(); await page.waitForURL(/\/subject\/bt$/);
  await page.getByRole("heading", { name: "Course Topics" }).waitFor();
  const first = page.locator("[data-topic-row]").first(); await first.locator("button").first().click(); await page.waitForTimeout(350);
  const mats = page.locator("[role=region][data-state=open] [data-material-row] button"); assert((await mats.count()) >= 2, "no materials listed");
  await mats.first().click(); const d = page.getByRole("dialog");
  await d.getByText("Access to this material is locked").waitFor(); await d.getByText("To study this material, sign in to your account.").waitFor();
  await d.getByRole("button", { name: "Cancel" }).click(); await d.waitFor({ state: "detached" });
});
await step("modal Sign in → /login?next=/subject/bt, and login returns to /subject/bt", async () => {
  await page.locator("[role=region][data-state=open] [data-material-row] button").first().click();
  await page.getByRole("dialog").getByRole("link", { name: "Sign in" }).click(); await page.waitForURL(/\/login\?next=%2Fsubject%2Fbt$/);
  await page.getByRole("button", { name: "Student", exact: true }).click(); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/subject/bt", { timeout: 15000 });
});
await c.close();

await step("dynamic: admin adds material to a BT topic → public outline shows it", async () => {
  const ac = await ctx(); const a = await ac.newPage(); const title = `Smoke Material ${String(Date.now()).slice(-5)}`;
  await a.goto("/login"); await a.getByRole("button", { name: "Admin", exact: true }).click(); await a.getByRole("button", { name: "Sign in", exact: true }).click(); await a.waitForURL(/\/admin$/);
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill(title); await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" });
  await a.locator("#f-kind").selectOption("notes"); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" }); await a.locator("#f-body").fill("smoke body text for the demo");
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  const pc = await ctx(); const p = await pc.newPage(); await p.goto("/subject/bt");
  const rowsN = await p.locator("[data-topic-row]").count();
  let found = false;
  for (let i = 0; i < rowsN && !found; i++) { await p.locator("[data-topic-row]").nth(i).locator("button").first().click(); await p.waitForTimeout(350); found = (await p.getByText(title).count()) >= 1; }
  assert(found, "new material not shown on the public outline");
  assert(!(await p.content()).includes("smoke body text"), "material body leaked");
  await pc.close(); await ac.close();
});

await step("responsive chain: home → all courses → subject → topic → modal at 360/390/768/1024/1280/1440", async () => {
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const x = await ctx({ viewport: { width: w, height: 800 }, hasTouch: w < 1024 }); const p = await x.newPage();
    await p.goto("/"); assert((await over(p)) <= 0, `${w}: home overflow`);
    await p.goto("/all-courses"); await p.getByRole("heading", { name: "All courses", level: 1 }).waitFor(); assert((await over(p)) <= 0, `${w}: all-courses overflow`);
    const link = p.getByRole("link", { name: /^Open BT — / }); const lb = await link.boundingBox(); assert(lb.height >= 44 && lb.x >= 0 && lb.x + lb.width <= w, `${w}: subject link size/position`);
    await link.click(); await p.waitForURL(/\/subject\/bt$/); assert((await over(p)) <= 0, `${w}: subject overflow`);
    await p.locator("[data-topic-row] button").first().click(); await p.waitForTimeout(350); assert((await over(p)) <= 0, `${w}: overflow with topic open`);
    const mb = await p.locator("[data-material-row] button").first().boundingBox(); assert(mb.height >= 44 && mb.x + mb.width <= w, `${w}: material row`);
    await p.locator("[data-material-row] button").first().click();
    const btn = await p.getByRole("dialog").getByRole("link", { name: "Sign in" }).boundingBox(); assert(btn && btn.x >= 0 && btn.x + btn.width <= w, `${w}: modal button outside`);
    assert((await over(p)) <= 0, `${w}: overflow with modal`);
    await x.close();
  }
});
await step("RU and UZ: all-courses + modal texts translated", async () => {
  for (const [loc, heading, text] of [["ru", "Все курсы", "Чтобы изучать этот материал, войдите в свой аккаунт."], ["uz", "Barcha kurslar", "Bu materialni o‘rganish uchun hisobingizga kiring."]]) {
    const x = await ctx({ locale: loc }); const p = await x.newPage(); await p.goto("/all-courses"); await p.getByRole("heading", { name: heading, level: 1 }).waitFor();
    await p.goto("/subject/bt"); await p.locator("[data-topic-row] button").first().click(); await p.waitForTimeout(300);
    await p.locator("[data-material-row] button").first().click(); await p.getByRole("dialog").getByText(text).waitFor(); await x.close();
  }
});

await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
