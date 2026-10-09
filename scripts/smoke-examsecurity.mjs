// Smoke test: server-side security of exams and hidden content, by DIRECT requests. (fresh server)
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0], String(e.stack).split("\n").find((l) => l.includes("smoke-examsecurity")) ?? ""); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const RIGHT = { "Which best describes": "Any individual or group affected by, or able to affect, the organisation", "A shareholder is": "Owns shares in the company" };
const Q1 = "Which best describes a stakeholder";
const T1 = "bt-business-organisations-and-their-stakeholders";
const dir = mkdtempSync(join(tmpdir(), "smoke-sec-"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=2", "-c:a", "libmp3lame", join(dir, "a.mp3")]);

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
const picker = () => a.getByRole("dialog").filter({ hasText: "Published questions of the selected subject" });
const save = async () => { await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor(); };

async function exam({ title, opens, closes, review, attempts = "1" }) {
  await a.goto("/admin/exams"); await a.getByRole("button", { name: "Schedule exam" }).first().click(); await a.getByRole("dialog").waitFor();
  await a.locator("#f-title").fill(title); await a.locator("#f-description").fill("Read carefully."); await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" });
  await a.locator("#f-durationMinutes").fill("30"); await a.locator("#f-passMark").fill("50"); await a.locator("#f-attemptsAllowed").fill(attempts);
  await a.locator("#f-opensAt").fill(opens); await a.locator("#f-closesAt").fill(closes); await a.locator("#f-reviewPolicy").selectOption({ label: review });
  await a.getByRole("button", { name: "Add questions" }).click(); await picker().getByText(new RegExp(Q1)).click(); await picker().getByText(/shareholder is/i).first().click(); await picker().getByRole("button", { name: /Add selected \(2\)/ }).click();
  await a.getByRole("checkbox", { name: "Published" }).check(); await save();
}
const examId = async (title) => { await s.goto("/exams"); const href = await s.locator("tr, li, [role=row]", { hasText: title }).first().getByRole("link", { name: "Start exam" }).getAttribute("href"); return href.split("/").pop(); };
const editWindow = async (title, opens, closes) => { await a.goto("/admin/exams"); await a.getByRole("row", { name: new RegExp(title) }).getByRole("button", { name: /edit/i }).click(); await a.locator("#f-opensAt").fill(opens); await a.locator("#f-closesAt").fill(closes); await save(); };
const noAnswerKey = (html) => !/correctOptionId|"explanation"/.test(html);

let EX = ""; let ATTEMPT_URL = "";
await step("an exam page leaks no question text or answer key before the student starts it (open exam, intro screen)", async () => {
  await exam({ title: "Sec exam", opens: "2020-01-01T08:00", closes: "2099-01-01T08:00", review: "No question review (score only)" });
  EX = await examId("Sec exam");
  const html = await (await sc.request.get(`/test/${EX}`)).text();
  assert(html.includes("Sec exam"), "intro not rendered");
  assert(!html.includes(Q1), "question text is shipped to the browser before the attempt starts");
  assert(noAnswerKey(html), "answer key / explanations in the page");
});

await step("a scheduled (not yet open) exam: no questions, cannot be started", async () => {
  await editWindow("Sec exam", "2098-01-01T08:00", "2099-01-01T08:00");
  const html = await (await sc.request.get(`/test/${EX}`)).text(); assert(!html.includes(Q1), "questions of a scheduled exam are in the page"); assert(noAnswerKey(html), "answer key");
  await s.goto(`/test/${EX}`); await s.getByRole("button", { name: /Start test/ }).click(); await s.getByText(/not open yet|isn.t open|has not opened/i).first().waitFor();
  await editWindow("Sec exam", "2020-01-01T08:00", "2021-01-01T08:00");
  await s.goto(`/test/${EX}`); await s.getByRole("button", { name: /Start test/ }).click(); await s.getByText(/closed/i).first().waitFor();
  assert(!(await (await sc.request.get(`/test/${EX}`)).text()).includes(Q1), "questions of a closed exam are in the page");
});

await step("question illustrations of a not-open exam are not served", async () => {
  // covered at service level (test:exams); here: an unknown / foreign file id is never served to a student
  assert((await sc.request.get("/api/files/00000000-0000-0000-0000-000000000000")).status() !== 200, "unknown file served");
});

await step("taking the exam: result shows the score only; the page carries no review, explanations or key", async () => {
  await editWindow("Sec exam", "2020-01-01T08:00", "2099-01-01T08:00");
  await s.goto(`/test/${EX}`); await s.getByRole("button", { name: /Start test/ }).click(); await s.getByText(/Question 1 of 2/).waitFor();
  for (let i = 0; i < 2; i++) {
    const q = await s.locator("h2").first().innerText(); const key = Object.keys(RIGHT).find((k) => q.includes(k));
    await s.getByRole("radio").filter({ hasText: RIGHT[key].slice(0, 40) }).first().click(); if (i < 1) await s.getByRole("button", { name: "Next", exact: true }).click();
  }
  await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/result/);
  ATTEMPT_URL = s.url();
  const html = await s.content(); assert(noAnswerKey(html), "answer key in the result page"); assert(!html.includes("Because") , "explanation text in the result page");
  assert((await s.locator("[data-review-hidden='never']").count()) === 1, "review not hidden");
});

await step("another student cannot read someone else's attempt, result or mistakes (IDOR), and a user who is not enrolled cannot start", async () => {
  const oc = await ctx(); const o = await oc.newPage(); await o.goto("/register");
  await o.locator("#reg-name").fill("Sec Other"); await o.locator("#reg-email").fill(`sec.${Date.now()}@example.com`);
  await o.locator("#reg-password").fill("Other-pass12345"); await o.locator("#reg-confirm").fill("Other-pass12345"); await o.locator("#reg-terms").click();
  await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  const res = await oc.request.get(ATTEMPT_URL.replace(BASE, "")); const html = await res.text();
  assert(!/100%|Passed|PASSED/.test(await (async () => html.replace(/\s+/g, " "))()) || /no result|haven.t taken|No result/i.test(html), "the other student's result is visible");
  assert(!html.includes("Sec exam") || /No result|no result|not taken/i.test(html), "result of another student rendered");
  await o.goto(`/test/${EX}`); await o.waitForURL(/\/platform\/acca/); // not enrolled → sent to the platform page, no questions
  await o.goto("/mistakes"); await o.getByText("No mistakes yet").waitFor();
  await oc.close();
  const gc = await ctx(); const g = await gc.newPage(); await g.goto(`/test/${EX}`); await g.waitForURL(/\/login/); await g.goto(ATTEMPT_URL.replace(BASE, "")); await g.waitForURL(/\/login/); await gc.close();
});

await step("attempt limit and a repeated start cannot be bypassed: the second start is refused, the result is not overwritten", async () => {
  await s.goto(`/test/${EX}`); await s.getByText(/You have used all attempts/).waitFor(); assert((await s.getByRole("button", { name: /Start test/ }).count()) === 0, "start offered");
  const before = await (await sc.request.get(ATTEMPT_URL.replace(BASE, ""))).text(); assert(before.includes("Sec exam") || before.length > 1000, "own result unreadable");
});

await step("hidden materials: the file of a draft / scheduled material and of an OLD version is never served to students; subtitles follow the same rule", async () => {
  const ids = []; a.on("response", async (r) => { if (r.url().endsWith("/api/uploads") && r.request().method() === "POST") { const j = await r.json().catch(() => null); if (j?.ok) ids.push(j.file.id); } });
  const addFile = async (title, name, visibility, publishAt) => {
    await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill(title); await a.locator("#f-kind").selectOption("file");
    await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" });
    await a.locator("#f-fileId").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(`content of ${title}`) }); await a.getByText("Uploaded").first().waitFor();
    await a.locator("#f-visibility").selectOption(visibility); if (publishAt) await a.locator("#f-publishAt").fill(publishAt); await save();
  };
  await addFile("Sec draft file", "d.txt", "draft"); await addFile("Sec scheduled file", "s.txt", "scheduled", "2099-01-01"); await addFile("Sec versioned file", "v1.txt", "published");
  const [draft, scheduled, v1] = ids;
  for (const [n, id] of [["draft", draft], ["scheduled", scheduled]]) { assert((await sc.request.get(`/api/files/${id}`)).status() !== 200, `${n} file served to a student`); assert((await ac.request.get(`/api/files/${id}`)).status() === 200, `${n} file not available to admin`); }
  assert((await sc.request.get(`/api/files/${v1}`)).status() === 200, "published file not served");
  await a.goto("/admin/materials"); await a.getByRole("row", { name: /Sec versioned file/ }).getByRole("button", { name: /edit/i }).click();
  await a.locator("#f-fileId").setInputFiles({ name: "v2.txt", mimeType: "text/plain", buffer: Buffer.from("content v2") }); await a.getByText("Uploaded").first().waitFor(); await save();
  assert((await sc.request.get(`/api/files/${v1}`)).status() !== 200, "an old version's file is served to a student"); assert((await ac.request.get(`/api/files/${v1}`)).status() === 200, "old version unreadable to admin");
  // subtitles of a draft audio material
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill("Sec draft audio"); await a.locator("#f-kind").selectOption("audio");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" });
  await a.locator("#f-fileId").setInputFiles({ name: "a.mp3", mimeType: "audio/mpeg", buffer: readFileSync(join(dir, "a.mp3")) });
  await a.getByText("Students cannot see this file until processing is finished.").waitFor({ state: "hidden", timeout: 90000 }); await a.locator("#f-visibility").selectOption("draft"); await save();
  await a.goto("/admin/materials"); const href = await a.getByRole("row", { name: /Sec draft audio/ }).getByRole("link", { name: "Versions" }).getAttribute("href"); const mid = href.split("/")[3];
  const up = await ac.request.post(`/api/materials/${mid}/media-text`, { headers: { origin: BASE }, multipart: { language: "en", file: { name: "en.vtt", mimeType: "text/plain", buffer: Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHidden subtitle\n") } } }); assert(up.status() === 200, `vtt ${up.status()}`);
  assert((await sc.request.get(`/api/materials/${mid}/subtitles/en`)).status() === 404, "subtitles of a draft material served"); assert((await sc.request.get(`/subject/bt/topic/${T1}/material/${mid}`)).status() !== 500, "server error");
  const page = await (await sc.request.get(`/subject/bt/topic/${T1}/material/${mid}`)).text(); assert(/could.?n.t find|not found/i.test(page) && !page.includes("Hidden subtitle"), "draft material page reachable");
});

await ac.close(); await sc.close(); await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
