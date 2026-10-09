// Smoke test: material analytics — real events only. (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T1 = "bt-business-organisations-and-their-stakeholders";
const NOTES = `${T1}-notes`;
const corrupt = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(16), Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37) % 251))]);

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
const cell = async (id, col, query = "") => { await a.goto(`/admin/materials/analytics${query}`); return (await a.locator(`[data-material-row="${id}"] [data-col="${col}"]`).innerText()).trim(); };

await step("before any student activity every number is 0 / — (nothing invented), including seeded materials", async () => {
  await a.goto("/admin/materials/analytics"); await a.locator("[data-material-stats]").waitFor();
  const rows = await a.locator("[data-material-row]").count(); assert(rows >= 7, `rows ${rows}`);
  for (const col of ["views", "viewers", "completions"]) for (const v of await a.locator(`[data-col="${col}"]`).allInnerTexts()) assert(v.trim() === "0", `${col} shows ${v}`);
  for (const v of await a.locator('[data-col="rate"]').allInnerTexts()) assert(v.trim() === "—", `rate shows ${v}`);
  assert((await a.locator("[data-material-totals]").innerText()).replace(/\s+/g, " ").includes("0 Views"), "totals not zero");
});

await step("a student opening a material is one view; reopening within 30 minutes does not inflate it; admin opens are not counted", async () => {
  const open = async () => { await s.goto(`/subject/bt/topic/${T1}/material/${NOTES}`); await s.waitForLoadState("networkidle"); await s.waitForTimeout(400); };
  await open(); await open();
  await a.goto(`/subject/bt/topic/${T1}/material/${NOTES}`); await a.waitForLoadState("networkidle"); await a.waitForTimeout(400);
  assert((await cell(NOTES, "views")) === "1", "views should be 1"); assert((await cell(NOTES, "viewers")) === "1", "viewers should be 1");
  assert((await cell(NOTES, "completions")) === "0", "completions should still be 0"); assert((await cell(NOTES, "rate")) === "0%", "rate should be 0% with a viewer and no completion");
});

await step("completion: marking completed counts once; undoing removes it; rate = completions ÷ viewers", async () => {
  await s.goto(`/subject/bt/topic/${T1}/material/${NOTES}`);
  await s.getByRole("button", { name: "Mark as completed" }).click(); await s.getByRole("button", { name: "Completed" }).waitFor(); await s.waitForLoadState("networkidle");
  assert((await cell(NOTES, "completions")) === "1", "completion not counted"); assert((await cell(NOTES, "rate")) === "100%", "rate should be 100%");
  await s.getByRole("button", { name: "Completed" }).click(); await s.getByRole("button", { name: "Mark as completed" }).waitFor(); await s.waitForLoadState("networkidle");
  assert((await cell(NOTES, "completions")) === "0", "an undone completion is still counted");
  await s.getByRole("button", { name: "Mark as completed" }).click(); await s.getByRole("button", { name: "Completed" }).waitFor(); await s.waitForLoadState("networkidle");
});

await step("date range: a future-only period shows zeros for the same material (events are filtered by date)", async () => {
  const d = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const q = `?range=custom&from=${d(2)}&to=${d(3)}`;
  assert((await cell(NOTES, "views", q)) === "0", "future period shows views"); assert((await cell(NOTES, "completions", q)) === "0", "future period shows completions");
  assert((await cell(NOTES, "views")) === "1", "default period lost the view");
});

await step("processing errors: a rejected video is listed with its reason and counted; a draft is labelled", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Broken stats video"); await a.locator("#f-kind").selectOption("video");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" });
  await a.locator("#f-fileId").setInputFiles({ name: "broken.mp4", mimeType: "video/mp4", buffer: corrupt });
  await a.getByText("File rejected").waitFor({ timeout: 60000 });
  await a.locator("#f-visibility").selectOption("draft"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/materials/analytics");
  const row = a.locator("[data-material-row]", { hasText: "Broken stats video" });
  const fileCell = (await row.locator('[data-col="file"]').innerText()).trim();
  assert(/Rejected/.test(fileCell) && /damaged|not a valid media file/i.test(fileCell), `file cell: ${fileCell}`);
  assert(/Draft/.test(await row.innerText()), "draft not labelled");
  assert(/1\s*Processing errors/i.test((await a.locator("[data-material-totals]").innerText()).replace(/\s+/g, " ")), "processing error not counted in totals");
});

await step("access: students cannot open the analytics page", async () => {
  await s.goto("/admin/materials/analytics"); assert(!new URL(s.url()).pathname.startsWith("/admin"), "student reached analytics");
});

await ac.close(); await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
