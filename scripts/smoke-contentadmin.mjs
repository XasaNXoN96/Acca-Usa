// Smoke test: admin content management — draft / scheduled / published, ordering, preview as student, bulk upload.
// BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/smoke-contentadmin.mjs  (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T1 = "bt-business-organisations-and-their-stakeholders";
const TOPIC_URL = `/subject/bt/topic/${T1}`;
const TOPIC_LABEL = "Business organisations and their stakeholders";

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
const topicText = async () => { await s.goto(TOPIC_URL); await s.waitForLoadState("networkidle"); return s.locator("main").innerText(); };

async function addNote(title, visibility, extra = {}) {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill(title); await a.locator("#f-kind").selectOption("notes");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: TOPIC_LABEL });
  await a.locator("#f-body").fill(`Body of ${title} for the content admin smoke test.`);
  await a.locator("#f-visibility").selectOption(visibility);
  if (extra.publishAt) await a.locator("#f-publishAt").fill(extra.publishAt);
  if (extra.position !== undefined) await a.locator("#f-position").fill(String(extra.position));
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
}
const materialUrl = async (title) => { await a.goto(TOPIC_URL); const href = await a.getByRole("link", { name: new RegExp(title) }).first().getAttribute("href"); return href; };

await step("draft material: admin sees it with a Draft badge; student does not see it anywhere (topic page, direct URL)", async () => {
  await addNote("Draft only note", "draft");
  await a.goto("/admin/materials"); await a.getByText("Draft only note").first().waitFor();
  assert(await a.getByText("Draft (hidden from students)").first().isVisible(), "draft badge missing");
  const text = await topicText(); assert(!text.includes("Draft only note"), "student sees a draft in the topic list");
  const href = await materialUrl("Draft only note"); assert(href, "admin cannot reach the draft through the topic page");
  const stud = await sc.request.get(href); assert(/could.?n.t find|not found/i.test(await stud.text()), `student opened a draft material (${stud.status()})`);
  await a.goto(href); await a.getByText("Body of Draft only note").waitFor(); // preview as student works for admin
});

await step("publish a draft → student sees it and can open it; unpublish → hidden again", async () => {
  await a.goto("/admin/materials"); await a.getByRole("row", { name: /Draft only note/ }).getByRole("button", { name: /edit/i }).click();
  await a.locator("#f-visibility").selectOption("published"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  assert((await topicText()).includes("Draft only note"), "published material not visible");
  const href = await materialUrl("Draft only note"); await s.goto(href); await s.getByText("Body of Draft only note").waitFor();
  await a.goto("/admin/materials"); await a.getByRole("row", { name: /Draft only note/ }).getByRole("button", { name: /edit/i }).click();
  await a.locator("#f-visibility").selectOption("draft"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  assert(!(await topicText()).includes("Draft only note"), "unpublished material still visible");
});

await step("scheduled material: hidden until its date (future date), badge shows the date; scheduling needs a date", async () => {
  await addNote("Scheduled note", "scheduled", { publishAt: "2099-01-01" });
  await a.goto("/admin/materials"); await a.getByText(/Scheduled · /).first().waitFor();
  assert(!(await topicText()).includes("Scheduled note"), "future-scheduled material visible");
  // missing date is refused
  await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill("No date note"); await a.locator("#f-kind").selectOption("notes");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-body").fill("Some body text here."); await a.locator("#f-visibility").selectOption("scheduled");
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.locator("#f-publishAt-error, [id$='publishAt-error']").first().waitFor(); await a.keyboard.press("Escape");
});

await step("a date in the past is live immediately (scheduled → published by time, no job needed)", async () => {
  await addNote("Past scheduled note", "scheduled", { publishAt: "2020-01-01" });
  assert((await topicText()).includes("Past scheduled note"), "past-scheduled material not visible");
});

await step("ordering: position controls the order inside the topic for students", async () => {
  await addNote("Order Z first created", "published", { position: 9 });
  await addNote("Order A second created", "published", { position: 1 });
  const text = await topicText();
  assert(text.indexOf("Order A second created") !== -1 && text.indexOf("Order Z first created") !== -1, "ordered notes missing");
  assert(text.indexOf("Order A second created") < text.indexOf("Order Z first created"), "position ignored");
});

await step("bulk upload: several files, per-file progress/state, invalid type rejected, created as drafts, students see none of them", async () => {
  const uploaded = []; a.on("response", async (r) => { if (r.url().endsWith("/api/uploads") && r.request().method() === "POST") { const j = await r.json().catch(() => null); if (j?.ok) uploaded.push(j.file.id); } });
  await a.goto("/admin/materials/bulk");
  await a.locator("#bu-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#bu-topic").selectOption({ label: TOPIC_LABEL });
  await a.locator("#bu-files").setInputFiles([
    { name: "bulk-notes-one.txt", mimeType: "text/plain", buffer: Buffer.from("bulk text file one") },
    { name: "bulk-notes-two.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2\n") },
    { name: "bulk-tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ....") },
  ]);
  await a.getByText("This file type is not accepted.").waitFor();
  await a.getByRole("button", { name: "Upload and create materials" }).click();
  await a.locator("li[data-state='done']").nth(1).waitFor({ timeout: 60000 });
  assert((await a.locator("li[data-state='done']").count()) === 2, "two files should be done");
  assert((await a.locator("li[data-state='error']").count()) === 1, "the .exe row should stay an error");
  await a.goto("/admin/materials"); await a.getByText("bulk notes one").first().waitFor(); await a.getByText("bulk notes two").first().waitFor();
  assert(!(await topicText()).includes("bulk notes one"), "bulk-created drafts are visible to students");
  assert(uploaded.length === 2, `uploads ${uploaded.length}`);
  for (const id of uploaded) { assert((await sc.request.get(`/api/files/${id}`)).status() !== 200, "student fetched the file of a draft material"); assert((await ac.request.get(`/api/files/${id}`)).status() === 200, "admin cannot fetch the draft file"); }
});

await step("access control: a student cannot open the admin bulk page or the admin materials list", async () => {
  for (const path of ["/admin/materials/bulk", "/admin/materials"]) { await s.goto(path); assert(!new URL(s.url()).pathname.startsWith("/admin"), `student reached ${path}`); }
});

await ac.close(); await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
