// Smoke test: private student notes (server-side, anchored to PDF page / video time). (fresh server)
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T1 = "bt-business-organisations-and-their-stakeholders";
const M = (k) => `/subject/bt/topic/${T1}/material/${T1}-${k}`;
const dir = mkdtempSync(join(tmpdir(), "smoke-notes-"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=duration=4", "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "150k", "-c:a", "libopus", join(dir, "v.webm")]);

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
const NOTE = "My private reminder about stakeholders";

await step("add a note: saved on the server (survives reload), not in localStorage; admins get no notes panel", async () => {
  await s.goto(M("notes")); await s.locator("[data-notes-panel]").waitFor(); await s.getByText("You have no notes on this material yet.").waitFor();
  await s.locator("#note-new").fill(NOTE); await s.getByRole("button", { name: "Add note" }).click();
  await s.locator("[data-note]", { hasText: NOTE }).waitFor();
  await s.reload(); await s.locator("[data-note]", { hasText: NOTE }).waitFor();
  const stored = await s.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  assert(!stored.includes("stakeholders"), "the note text is in browser storage");
  await a.goto(M("notes")); await a.getByRole("heading", { level: 1 }).waitFor(); assert((await a.locator("[data-notes-panel]").count()) === 0, "admin sees a notes panel");
});

await step("edit and delete a note", async () => {
  await s.goto(M("notes"));
  const row = s.locator("[data-note]", { hasText: NOTE });
  await row.getByRole("button", { name: "Edit" }).click(); await s.locator("textarea[id^='edit-']").fill("Edited reminder text");
  await s.getByRole("button", { name: "Save", exact: true }).click(); await s.locator("[data-note]", { hasText: "Edited reminder text" }).waitFor();
  await s.reload(); await s.locator("[data-note]", { hasText: "Edited reminder text" }).waitFor();
  s.once("dialog", (d) => d.accept()); await s.locator("[data-note]", { hasText: "Edited reminder text" }).getByRole("button", { name: "Delete" }).click();
  await s.getByText("You have no notes on this material yet.").waitFor(); await s.reload(); await s.getByText("You have no notes on this material yet.").waitFor();
});

await step("validation: an empty note cannot be added; a 2001-character note is refused by the server", async () => {
  await s.goto(M("notes")); assert(await s.getByRole("button", { name: "Add note" }).isDisabled(), "empty note can be submitted");
  await s.locator("#note-new").evaluate((el) => { el.removeAttribute("maxlength"); });
  await s.locator("#note-new").fill("x".repeat(2001)); await s.getByRole("button", { name: "Add note" }).click();
  await s.getByText("Couldn’t save the note. Please try again.").waitFor(); assert((await s.locator("[data-note]").count()) === 0, "an oversize note was saved");
});

await step("PDF note is anchored to the current page; the chip shows it", async () => {
  await s.goto(M("pdf")); await s.locator("[data-pdf-reader] canvas").waitFor({ timeout: 30000 });
  await s.getByRole("button", { name: "Add current page" }).click(); await s.locator("[data-note-anchor]").waitFor();
  await s.locator("#note-new").fill("See the cost table"); await s.getByRole("button", { name: "Add note" }).click();
  const row = s.locator("[data-note]", { hasText: "See the cost table" }); await row.waitFor();
  assert(/Page 1/.test(await row.innerText()), "page chip missing");
  await s.reload(); assert(/Page 1/.test(await s.locator("[data-note]", { hasText: "See the cost table" }).innerText()), "page anchor not persisted");
});

await step("video note is anchored to the current time and jumping seeks the player", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Notes video"); await a.locator("#f-kind").selectOption("video");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" });
  await a.locator("#f-fileId").setInputFiles({ name: "lecture.webm", mimeType: "video/webm", buffer: readFileSync(join(dir, "v.webm")) });
  await a.getByText("Students cannot see this file until processing is finished.").waitFor({ state: "hidden", timeout: 90000 });
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await s.goto(`/subject/bt/topic/${T1}`); const href = await s.getByRole("link", { name: /Notes video/ }).first().getAttribute("href"); await s.goto(href);
  await s.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 1; }, null, { timeout: 30000 });
  await s.evaluate(() => { document.querySelector("video").currentTime = 2; }); await s.waitForFunction(() => document.querySelector("video").currentTime >= 1.9);
  await s.getByRole("button", { name: "Add current time" }).click(); await s.locator("#note-new").fill("Definition at two seconds"); await s.getByRole("button", { name: "Add note" }).click();
  const row = s.locator("[data-note]", { hasText: "Definition at two seconds" }); await row.waitFor();
  assert(/0:02/.test(await row.innerText()), `time chip: ${await row.innerText()}`);
  await s.evaluate(() => { document.querySelector("video").currentTime = 0; });
  await row.getByRole("button", { name: /0:02/ }).click(); await s.waitForFunction(() => document.querySelector("video").currentTime >= 1.9, null, { timeout: 5000 });
});

await step("My notes page lists the student's own notes, supports search, and marks notes whose material is hidden", async () => {
  await s.goto("/notes"); await s.locator("[data-notes-list]").waitFor();
  const all = await s.locator("[data-notes-list] [data-note]").count(); assert(all === 2, `notes ${all}`);
  await s.goto("/notes?q=cost"); assert((await s.locator("[data-notes-list] [data-note]").count()) === 1, "search by text failed");
  await s.goto("/notes?q=notes%20video"); assert((await s.locator("[data-notes-list] [data-note]").count()) === 1, "search by material title failed");
  await s.goto("/notes?q=zzzz-nothing"); await s.getByText("No notes match your search.").waitFor();
  // hide the video material → the note stays, without a link
  await a.goto("/admin/materials"); await a.getByRole("row", { name: /Notes video/ }).getByRole("button", { name: /edit/i }).click();
  await a.locator("#f-visibility").selectOption("draft"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await s.goto("/notes?q=two%20seconds"); const row = s.locator("[data-note]", { hasText: "Definition at two seconds" });
  await row.getByText("This material is not available to you right now.").waitFor(); assert((await row.locator("a").count()) === 0, "a hidden material is linked");
});

await step("privacy: another student sees none of these notes", async () => {
  const oc = await ctx(); const o = await oc.newPage(); await o.goto("/register");
  await o.locator("#reg-name").fill("Other Student"); await o.locator("#reg-email").fill(`other.${Date.now()}@example.com`);
  await o.locator("#reg-password").fill("Other-pass12345"); await o.locator("#reg-confirm").fill("Other-pass12345"); await o.locator("#reg-terms").click(); await o.locator("#reg-privacy").click();
  await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  await o.goto("/notes"); await o.getByText("No notes yet").waitFor();
  const html = await o.content(); assert(!html.includes("See the cost table") && !html.includes("Definition at two seconds"), "another student's notes leaked");
  await oc.close();
  const gc = await ctx(); const g = await gc.newPage(); await g.goto("/notes"); await g.waitForURL(/\/login/); await gc.close();
});

await ac.close(); await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
