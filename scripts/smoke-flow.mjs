// Full learning-flow regression: guest → student → admin → student → admin.
//   BASE_URL=http://localhost:3100 CHROMIUM=/path/to/chrome node scripts/smoke-flow.mjs   (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const TAG = String(Date.now()).slice(-5);
const T1 = "bt-business-organisations-and-their-stakeholders";
const save = (p) => p.getByRole("button", { name: "Save", exact: true }).click();

// ================= GUEST =================
const gc = await ctx(); const g = await gc.newPage();
await step("GUEST: Homepage → View courses → All Courses → ACCA → BT → topic → locked material → Login modal → Login → back on BT", async () => {
  await g.goto("/"); await g.getByRole("link", { name: "View courses" }).first().click(); await g.waitForURL(/\/all-courses$/);
  await g.locator("[data-platform-section=acca]").getByRole("heading", { name: "Applied Knowledge" }).waitFor(); await g.getByRole("link", { name: /^BT — / }).click(); await g.waitForURL(/\/subject\/bt$/);
  await g.locator("[data-topic-row] button").first().click(); await g.waitForTimeout(350);
  await g.locator("[data-material-row] button").first().click(); await g.getByRole("dialog").getByText("To study this material, sign in to your account.").waitFor();
  await g.getByRole("dialog").getByRole("link", { name: "Sign in" }).click(); await g.waitForURL(/\/login\?next=%2Fsubject%2Fbt$/);
  await g.getByRole("button", { name: "Student", exact: true }).click(); await g.getByRole("button", { name: "Sign in", exact: true }).click(); await g.waitForURL((u) => u.pathname === "/subject/bt", { timeout: 15000 });
});
assert(true);

// ================= STUDENT (demo) =================
const s = g; // the guest is now the signed-in demo student
await step("STUDENT: Dashboard → My Platforms → ACCA → BT → Topic → Material → Mark completed → Next material", async () => {
  await s.goto("/dashboard"); await s.getByRole("heading", { level: 1 }).waitFor(); await s.goto("/courses"); await s.getByRole("heading", { level: 1 }).waitFor();
  await s.goto("/platform/acca"); await s.getByRole("heading", { level: 1 }).waitFor(); await s.getByRole("link", { name: /Business and Technology/ }).first().click(); await s.waitForURL(/\/subject\/bt/);
  await s.getByRole("link", { name: /Business organisations and their stakeholders/ }).first().click(); await s.waitForURL(new RegExp(`/topic/${T1}$`));
  await s.locator("[data-material-item]").first().getByRole("link").click(); await s.waitForURL(/\/material\//);
  await s.getByRole("button", { name: "Mark as completed" }).click(); await s.getByRole("button", { name: "Completed" }).waitFor();
  await s.getByRole("link", { name: "Next material" }).click(); await s.waitForURL(/-video$/); await s.locator("video").waitFor();
});
await step("STUDENT: Test → Start → Questions → Submit → Result → Review → Progress → Dashboard", async () => {
  await s.goto(`/subject/bt/topic/${T1}`); await s.locator("[data-topic-test]").getByRole("link", { name: /Start test|Open test/ }).click(); await s.waitForURL(/\/test\/bt-stakeholders-test$/);
  await s.getByRole("button", { name: /Start test|Resume test/ }).click(); await s.getByText("Question 1 of 8").waitFor();
  await s.getByRole("radio").first().click(); await s.getByRole("button", { name: "Next", exact: true }).click(); await s.getByRole("radio").nth(1).click();
  await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/\/result/);
  await s.getByText(/%/).first().waitFor(); await s.locator("#review").getByText("Explanation").first().waitFor();
  await s.goto("/progress"); await s.getByRole("heading", { level: 1 }).waitFor(); await s.getByText(/Stakeholders — topic test/).first().waitFor();
  await s.goto("/dashboard"); await s.getByText(/Stakeholders — topic test/).first().waitFor(); await s.locator("[data-continue-material]").waitFor();
});

// ================= ADMIN =================
const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const CODE = `F${TAG}`.slice(0, 6); const SUB = `Flow Subject ${TAG}`; const TOPIC = `Flow topic ${TAG}`; const TEST = `Flow test ${TAG}`;
await step("ADMIN: Subject → Topic → Material → Question Bank (2 questions) → Test → Publish", async () => {
  await a.goto("/admin/subjects"); await a.getByRole("button", { name: "Add subject" }).click(); await a.locator("#f-code").fill(CODE); await a.locator("#f-name").fill(SUB); await a.locator("#f-level").selectOption({ label: "ACCA — Applied Knowledge" }); await save(a); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/topics"); await a.getByRole("button", { name: "Add topic" }).click(); await a.locator("#f-title").fill(TOPIC); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-durationMinutes").fill("10"); await a.locator("#f-lessonCount").fill("1"); await save(a); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill(`Flow notes ${TAG}`); await a.locator("#f-kind").selectOption("notes"); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: TOPIC }); await a.locator("#f-body").fill("Flow notes for the regression test."); await save(a); await a.getByText("Saved.").waitFor();
  for (const [i, q] of [["1", `What is 2 + 2 (flow ${TAG})?`], ["2", `Which letter is B (flow ${TAG})?`]]) {
    await a.goto("/admin/question-bank"); await a.getByRole("button", { name: "Add question" }).click(); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: `${CODE} · ${TOPIC}` });
    await a.locator("#f-text").fill(q); for (const [k, v] of [["A", "Alpha"], ["B", "Bravo"], ["C", "Charlie"], ["D", "Delta"]]) await a.locator(`#f-option${k}`).fill(v);
    await a.locator("#f-correct").selectOption("b"); await a.locator("#f-explanation").fill(`Bravo is the right answer to question ${i}.`); await a.locator("#f-points").fill("1"); await a.locator("#f-difficulty").selectOption("easy"); await save(a); await a.getByText("Saved.").waitFor();
  }
  await a.goto("/admin/tests"); await a.getByRole("button", { name: "Add test" }).click(); await a.locator("#f-title").fill(TEST); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: TOPIC }); await a.locator("#f-durationMinutes").fill("5"); await a.locator("#f-passMark").fill("50");
  await a.getByRole("button", { name: "Add questions" }).click(); const picker = a.getByRole("dialog").filter({ hasText: "Published questions of the selected subject" }); await picker.getByText(/What is 2 \+ 2/).click(); await picker.getByText(/Which letter is B/).click(); await picker.getByRole("button", { name: /Add selected \(2\)/ }).click();
  await a.locator("#f-published").click(); await save(a); await a.getByText("Saved.").waitFor();
});

// ================= STUDENT takes the admin-built test =================
const fc = await ctx(); const f = await fc.newPage();
await step("STUDENT (new): enroll → admin's subject → topic → material → test → submit → result 100 % → review shows the admin's explanation", async () => {
  await f.goto("/register"); await f.locator("#reg-name").fill("Flow Student"); await f.locator("#reg-email").fill(`flow.${Date.now()}@example.com`); await f.locator("#reg-password").fill("Flow-pass12345"); await f.locator("#reg-confirm").fill("Flow-pass12345"); await f.locator("#reg-terms").click(); await f.locator("#reg-privacy").click(); await f.getByRole("button", { name: "Create account" }).click(); await f.waitForURL(/dashboard$/);
  await f.goto("/courses"); await f.getByRole("button", { name: "Enroll (free in demo)" }).first().click(); await f.getByText("Enrolled").first().waitFor();
  await f.goto(`/subject/${CODE.toLowerCase()}`); await f.getByRole("link", { name: new RegExp(TOPIC) }).click(); await f.getByRole("link", { name: new RegExp(`Flow notes ${TAG}`) }).first().click(); await f.getByText("Flow notes for the regression test.").waitFor();
  await f.goto(`/subject/${CODE.toLowerCase()}`); await f.getByRole("link", { name: new RegExp(TOPIC) }).click(); await f.locator("[data-topic-test]").getByRole("link", { name: "Start test" }).click(); await f.getByRole("button", { name: "Start test" }).click(); await f.getByText("Question 1 of 2").waitFor();
  for (let i = 0; i < 2; i++) { await f.getByRole("radio").filter({ hasText: "Bravo" }).click(); if (i === 0) await f.getByRole("button", { name: "Next", exact: true }).click(); }
  await f.getByRole("button", { name: "Submit test" }).first().click(); await f.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await f.waitForURL(/\/result/);
  await f.getByText("100%").first().waitFor(); await f.getByText(/Bravo is the right answer to question/).first().waitFor();
  await f.goto("/dashboard"); await f.getByText(new RegExp(TEST)).first().waitFor();
});
await step("ADMIN: Statistics reflect the student's attempt (filtered by the new subject); certificate was auto-issued (all topics done)", async () => {
  await a.goto(`/admin/statistics?subject=${CODE.toLowerCase()}`); await a.locator("[data-stats-cards]").waitFor();
  const cards = Object.fromEntries(await a.locator("[data-stats-cards] > div").evaluateAll((els) => els.map((e) => { const p = e.innerText.split("\n").map((x) => x.trim()).filter(Boolean); return [p[1] ?? "", p[0] ?? ""]; })));
  assert(cards["Test attempts"] === "1" && cards["Pass rate"] === "100%" && cards["Average score"] === "100%", JSON.stringify(cards)); assert(cards["Subjects"] === "1" && cards["Tests"] === "1" && cards["Materials"] === "1", "scope counts");
  await a.locator("[data-chart=tests]").getByText(new RegExp(TEST)).waitFor();
  await a.goto("/admin/certificates"); await a.getByRole("cell", { name: `${CODE} — ${SUB}` }).first().waitFor(); await a.getByRole("cell", { name: "Flow Student" }).first().waitFor();
  await a.goto("/admin/notifications"); await a.getByText(/Flow Student submitted/).first().waitFor();
});
await gc.close(); await ac.close(); await fc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
