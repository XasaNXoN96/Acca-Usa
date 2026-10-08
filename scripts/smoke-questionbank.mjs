// Smoke test: admin Question Bank. BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/smoke-questionbank.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100" + "05fe02fea7e2f7340000000049454e44ae426082", "hex");
const TAG = `qb${String(Date.now()).slice(-5)}`;
const TEXT = `What best describes a stakeholder (${TAG})?`;

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const rowFor = (t) => a.locator("tr, [role=row], li, article").filter({ hasText: t }).first();
const openForm = async () => { await a.goto("/admin/question-bank"); await a.getByRole("button", { name: "Add question" }).click(); await a.getByRole("dialog").waitFor(); };
const fill = async (o) => {
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" });
  if (o.topic) await a.locator("#f-topic").selectOption({ label: o.topic });
  await a.locator("#f-text").fill(o.text);
  for (const [k, v] of [["A", "Individuals or groups affected by the organisation"], ["B", "Only the shareholders"], ["C", "Only the employees"], ["D", "Only the regulators"]]) await a.locator(`#f-option${k}`).fill(v);
  await a.locator("#f-correct").selectOption(o.correct ?? "a"); await a.locator("#f-explanation").fill("A stakeholder is anyone affected by the organisation."); await a.locator("#f-points").fill("2");
  await a.locator("#f-difficulty").selectOption(o.difficulty ?? "medium"); await a.locator("#f-status").selectOption(o.status ?? "published"); if (o.tags) await a.locator("#f-tags").fill(o.tags);
};
const save = async () => { await a.getByRole("button", { name: "Save", exact: true }).click(); };

await step("validation: empty / too-short / invalid tags are rejected with messages", async () => {
  await openForm(); await save(); await a.getByText("This field is required.").first().waitFor();
  await fill({ text: "Too short" }); await a.locator("#f-text").fill("short"); await save(); await a.getByText(/at least 10 characters/).first().waitFor();
  await a.locator("#f-text").fill(TEXT); await a.locator("#f-tags").fill("a,b,c,d,e,f,g,h,i,j,k"); await save(); await a.getByText("Use up to 10 tags").first().waitFor();
  await a.keyboard.press("Escape");
});
await step("create: question with topic, tags, image, status and correct answer", async () => {
  await openForm(); await fill({ text: TEXT, topic: "BT · Business organisations and their stakeholders", tags: `${TAG}, stakeholders`, correct: "a", difficulty: "medium" });
  await a.locator("#f-imageId").setInputFiles({ name: "q.png", mimeType: "image/png", buffer: png }); await a.getByText("Uploaded").first().waitFor();
  await save(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/question-bank"); await rowFor(TEXT).waitFor();
});
await step("search by text and by tag; filters platform / subject / topic / difficulty / status", async () => {
  const search = a.locator("#admin-search");
  await search.fill(TAG); await rowFor(TEXT).waitFor(); await search.fill("zzzz-no-such"); await a.getByText("No records match your search.").waitFor();
  await search.fill("stakeholders"); await rowFor(TEXT).waitFor(); await search.fill("");
  const pick = async (id, label) => { await a.locator(id).selectOption({ label }); };
  await pick("#flt-platform", "ACCA"); await rowFor(TEXT).waitFor();
  await pick("#flt-subject", "BT — Business and Technology"); await rowFor(TEXT).waitFor();
  await pick("#flt-difficulty", "Hard"); await a.getByText("No records match your search.").waitFor(); await pick("#flt-difficulty", "Medium"); await rowFor(TEXT).waitFor();
  await pick("#flt-status", "Draft"); await a.getByText("No records match your search.").waitFor(); await pick("#flt-status", "Published"); await rowFor(TEXT).waitFor();
  await a.locator("#flt-topic").selectOption({ index: 1 }); // some topic filter value works without error
  await a.locator("#flt-topic").selectOption({ label: "BT · Business organisations and their stakeholders" }); await rowFor(TEXT).waitFor();
});
await step("preview shows the question, the correct option and the explanation", async () => {
  await a.getByRole("button", { name: new RegExp(`Preview: .*${TAG}`) }).click(); const d = a.getByRole("dialog");
  await d.getByText(TEXT).waitFor(); await d.getByText(/Correct: A/).waitFor(); await d.getByText("A stakeholder is anyone affected by the organisation.").waitFor(); await d.locator("img").waitFor();
  await a.keyboard.press("Escape");
});
await step("edit: change correct answer, difficulty, status → draft; list reflects it", async () => {
  await a.getByRole("button", { name: new RegExp(`Edit: .*${TAG}`) }).click(); await a.locator("#f-correct").selectOption("b"); await a.locator("#f-difficulty").selectOption("hard"); await a.locator("#f-status").selectOption("draft");
  await save(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/question-bank"); await a.locator("#flt-status").selectOption({ label: "Draft" }); await rowFor(TEXT).waitFor();
  await a.getByRole("button", { name: new RegExp(`Preview: .*${TAG}`) }).click(); await a.getByRole("dialog").getByText(/Correct: B/).waitFor(); await a.keyboard.press("Escape");
});
await step("archive (soft delete) → hidden; status filter 'Archived' shows it; restore works", async () => {
  await a.goto("/admin/question-bank"); await a.getByRole("button", { name: new RegExp(`Archive: .*${TAG}`) }).click(); await a.getByRole("dialog").getByRole("button", { name: "Archive" }).click(); await a.getByText(/Record archived/).waitFor();
  await rowFor(TEXT).waitFor({ state: "detached" });
  await a.locator("#flt-status").selectOption({ label: "Archived" }); await rowFor(TEXT).waitFor();
  await a.getByRole("button", { name: new RegExp(`Restore: .*${TAG}`) }).click(); await a.getByText("Record restored.").waitFor();
});
await step("students cannot see the answer key: public/student pages never contain correct answers; non-admin actions refused", async () => {
  const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
  assert((await sc.request.get("/admin/question-bank", { maxRedirects: 0 })).status() !== 200, "student reached the question bank");
  await s.goto("/exams"); assert(!(await s.content()).includes("correctOptionId"), "answer key in student page");
  await sc.close();
});
await step("mobile 360/390: question bank list, filters, form and preview fit the screen", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await ac.storageState() }); const p = await c.newPage();
    await p.goto("/admin/question-bank"); await p.getByRole("heading", { level: 1 }).waitFor();
    assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow on list`);
    await p.getByRole("button", { name: "Add question" }).click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(300);
    assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow in form`);
    const b = await p.getByRole("dialog").boundingBox(); assert(b.x >= 0 && b.x + b.width <= w + 1, `${w}: dialog outside viewport`);
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: /^Preview:/ }).first().click(); await p.getByRole("dialog").waitFor(); assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow in preview`);
    await c.close();
  }
});
await ac.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
