// Smoke test: Admin → Question bank → Import from file (check first, import as drafts, duplicates, permissions).
//   BASE_URL=... CHROMIUM=... node scripts/smoke-questionimport.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 3).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };

const run = Date.now().toString(36);
const q = (n) => `Import smoke ${run} question ${n}: which option is correct for number ${n}?`;
const line = (n, extra = {}) => ["BT", "", q(n), "First answer", "Second answer", "Third answer", "Fourth answer", extra.correct ?? "B", "Because the second answer is the right one.", "2", "easy", "draft", "import-smoke"].map((c) => `"${c}"`).join(",");
const csv = ["subject,topic,text,a,b,c,d,correct,explanation,points,difficulty,status,tags", line(1), line(2), line(3, { correct: "Z" }), line(1)].join("\r\n");

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);

await step("the import page is linked from the question bank and explains the steps + offers the template", async () => {
  await a.goto("/admin/question-bank"); await a.getByRole("link", { name: "Import from file" }).click(); await a.waitForURL(/question-bank\/import/);
  await a.getByText("How it works").waitFor(); await a.getByRole("link", { name: "Download template" }).waitFor();
  const res = await a.request.get("/templates/questions-template.csv"); assert(res.status() === 200 && /subject,topic,text/.test(await res.text()), "template missing");
});
await step("a file is CHECKED first: 2 good rows, 1 bad row reported with its line and reason, 1 duplicate inside the file; nothing is added yet", async () => {
  await a.locator("input[type=file]").setInputFiles({ name: "questions.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await a.getByText(/Checked 4 rows: 2 are ready to import, 1 have problems, 1 already exist/).waitFor();
  await a.getByRole("row", { name: /4\s+correct\s+The correct answer must be A, B, C or D\./ }).waitFor();
  await a.goto("/admin/question-bank"); assert((await a.getByText(q(1)).count()) === 0, "dry run added a question");
});
await step("import creates the valid questions as DRAFTS; a second import of the same file skips them as duplicates", async () => {
  await a.goto("/admin/question-bank/import");
  await a.locator("input[type=file]").setInputFiles({ name: "questions.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await a.getByRole("button", { name: "Import 2 questions" }).click();
  await a.getByText(/Imported 2 questions as drafts\. 1 rows were not imported\./).waitFor();
  await a.goto("/admin/question-bank"); await a.getByText(q(1)).first().waitFor(); await a.getByText(q(2)).first().waitFor();
  await a.getByRole("row", { name: new RegExp(q(1).slice(0, 30)) }).getByText(/draft/i).first().waitFor();
  await a.goto("/admin/question-bank/import");
  await a.locator("input[type=file]").setInputFiles({ name: "questions.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await a.getByText(/Checked 4 rows: 0 are ready to import, 1 have problems, 3 already exist/).waitFor();
});
await step("wrong files are refused with a clear message (missing columns, not a CSV)", async () => {
  await a.goto("/admin/question-bank/import");
  await a.locator("input[type=file]").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("subject,text\nBT,hello there friend") });
  await a.getByText(/These columns are missing:/).waitFor();
  await a.locator("input[type=file]").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await a.getByText("Choose a .csv file.").waitFor();
});
await step("a student cannot open the import page", async () => {
  const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
  await s.goto("/admin/question-bank/import"); await s.waitForURL(/dashboard/);
});
await browser.close();
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
