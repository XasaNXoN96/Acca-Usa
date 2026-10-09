// Smoke test: material versions — safe replacement, history, restore, access. (fresh server)
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0], String(e.stack).split("\n").find((l) => l.includes("smoke-versions")) ?? ""); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T1 = "bt-business-organisations-and-their-stakeholders";
const TOPIC_LABEL = "Business organisations and their stakeholders";
const dir = mkdtempSync(join(tmpdir(), "smoke-ver-"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(dir, "v.mp4")]);
const corrupt = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(16), Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37) % 251))]);

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);

const openRow = async (title) => { await a.goto("/admin/materials"); const row = a.getByRole("row", { name: new RegExp(title) }); await row.getByRole("button", { name: /edit/i }).click(); };
const save = async () => { await a.getByRole("button", { name: "Save", exact: true }).click(); };
const idOf = async (title) => { await a.goto("/admin/materials"); const href = await a.getByRole("row", { name: new RegExp(title) }).getByRole("link", { name: "Versions" }).getAttribute("href"); return href.split("/")[3]; };
const studentSees = async (title, text) => {
  await s.goto(`/subject/bt/topic/${T1}`); const href = await s.getByRole("link", { name: new RegExp(title) }).first().getAttribute("href");
  await s.goto(href); await s.getByText(text).waitFor({ timeout: 15000 }); return href;
};

await step("replace a file: students get the new file, the old one is kept as version 1 (admin-readable), not served to students", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Versioned glossary"); await a.locator("#f-kind").selectOption("file");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: TOPIC_LABEL });
  await a.locator("#f-fileId").setInputFiles({ name: "glossary.txt", mimeType: "text/plain", buffer: Buffer.from("version one text") });
  await a.getByText("Uploaded").first().waitFor(); await save(); await a.getByText("Saved.").waitFor();
  const href = await studentSees("Versioned glossary", "version one text");
  const oldFile = await s.evaluate(async (h) => (await (await fetch(h)).text()).match(/\/api\/files\/([0-9a-f-]{36})/)?.[1] ?? null, href);
  await openRow("Versioned glossary");
  await a.locator("#f-fileId").setInputFiles({ name: "glossary.txt", mimeType: "text/plain", buffer: Buffer.from("version two text") });
  await a.getByText("Uploaded").first().waitFor(); await save(); await a.getByText("Saved.").waitFor();
  await studentSees("Versioned glossary", "version two text");
  const id = await idOf("Versioned glossary");
  await a.goto(`/admin/materials/${id}/versions`); await a.locator("[data-version]").first().waitFor();
  assert((await a.locator("[data-version]").count()) === 1, "one version expected");
  const openHref = await a.locator("[data-version] a", { hasText: "Open" }).getAttribute("href");
  const oldBytes = await ac.request.get(openHref); assert(oldBytes.status() === 200 && (await oldBytes.text()) === "version one text", "the old file was not kept");
  assert(oldFile === null || (await sc.request.get(openHref)).status() !== 200, "student can fetch a non-current version's file");
  assert((await sc.request.get(openHref)).status() !== 200, "student fetched the old version file");
});

await step("restore: version 1 becomes current again, the replaced content is kept as a version (nothing lost)", async () => {
  const id = await idOf("Versioned glossary");
  await a.goto(`/admin/materials/${id}/versions`); a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: "Restore" }).first().click(); await a.getByText("Version restored.").waitFor();
  await studentSees("Versioned glossary", "version one text");
  await a.reload(); await a.locator("[data-version]").first().waitFor();
  assert((await a.locator("[data-version]").count()) === 1, "the replaced version should be kept (1 version)");
  const openHref = await a.locator("[data-version] a", { hasText: "Open" }).getAttribute("href");
  assert((await (await ac.request.get(openHref)).text()) === "version two text", "version two is no longer stored");
});

await step("notes: editing the text keeps the previous text as a version and it can be restored", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Versioned notes"); await a.locator("#f-kind").selectOption("notes");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: TOPIC_LABEL });
  await a.locator("#f-body").fill("First draft of the notes text."); await save(); await a.getByText("Saved.").waitFor();
  await openRow("Versioned notes"); await a.locator("#f-body").fill("Second draft of the notes text."); await save(); await a.getByText("Saved.").waitFor();
  await studentSees("Versioned notes", "Second draft of the notes text.");
  const id = await idOf("Versioned notes"); await a.goto(`/admin/materials/${id}/versions`);
  await a.getByText(/First draft of the notes text/).waitFor();
  a.once("dialog", (d) => d.accept()); await a.getByRole("button", { name: "Restore" }).first().click();
  await a.getByText(/Version restored\.|went wrong|not ready|not found/i).first().waitFor({ timeout: 15000 }).catch(() => undefined);
  assert(await a.getByText("Version restored.").count() > 0, `restore failed: url=${a.url()} alerts=${JSON.stringify((await a.locator("[role=alert]").allInnerTexts()).filter(Boolean))} body=${(await a.locator("main").innerText()).slice(0, 300)}`);
  await studentSees("Versioned notes", "First draft of the notes text.");
});

await step("safe replacement: a corrupt / unprocessed video cannot replace a working one; the student keeps the old video", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Versioned lecture"); await a.locator("#f-kind").selectOption("video");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: TOPIC_LABEL });
  await a.locator("#f-fileId").setInputFiles({ name: "lecture.mp4", mimeType: "video/mp4", buffer: readFileSync(join(dir, "v.mp4")) });
  await a.getByText("Students cannot see this file until processing is finished.").waitFor({ state: "hidden", timeout: 90000 });
  await save(); await a.getByText("Saved.").waitFor();
  await s.goto(`/subject/bt/topic/${T1}`); const href = await s.getByRole("link", { name: /Versioned lecture/ }).first().getAttribute("href");
  await s.goto(href); await s.locator("video").waitFor(); const before = await s.locator("video source").getAttribute("src");
  await openRow("Versioned lecture");
  await a.locator("#f-fileId").setInputFiles({ name: "broken.mp4", mimeType: "video/mp4", buffer: corrupt });
  await a.getByText("File rejected").waitFor({ timeout: 60000 });
  await save(); await a.getByText(/The new file is not ready/).first().waitFor(); await a.keyboard.press("Escape");
  await s.goto(href); assert((await s.locator("video source").getAttribute("src")) === before, "the student's video changed");
  const range = await sc.request.get(before, { headers: { Range: "bytes=0-9" } }); assert(range.status() === 206, `old video not served (${range.status()})`);
  const id = await idOf("Versioned lecture"); await a.goto(`/admin/materials/${id}/versions`);
  assert((await a.locator("[data-version]").count()) === 0, "a failed replacement created a version");
});

await step("access: students cannot open the versions page", async () => {
  const id = await idOf("Versioned glossary");
  await s.goto(`/admin/materials/${id}/versions`); assert(!new URL(s.url()).pathname.startsWith("/admin"), "student reached the versions page");
});

await ac.close(); await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
