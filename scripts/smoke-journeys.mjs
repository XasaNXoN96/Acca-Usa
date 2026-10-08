// Final user journeys (one data set, three actors): ADMIN builds a course → NEW LEARNER takes it end to end (guest → register →
// … → certificate) → PAYMENT journey on a paid platform. BASE_URL=... CHROMIUM=... node scripts/smoke-journeys.mjs  (fresh server)
// The payment step uses the demo provider's clearly-labelled simulation (demo mode only); the production webhook path with real
// signatures is covered by scripts/test-production-mode.mjs — no provider success is ever faked in production.
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const TAG = String(Date.now()).slice(-5);
const CODE = `J${TAG}`; const SUB = `Journey Subject ${TAG}`; const TOPIC = `Journey topic ${TAG}`; const TEST = `Journey test ${TAG}`; const NOTES = `Journey notes ${TAG}`;
const save = (p) => p.getByRole("button", { name: "Save", exact: true }).click();
const h1 = (p) => p.getByRole("heading", { level: 1 }).first().waitFor();

// ═════════════ ADMIN ═════════════
const ac = await ctx(); const a = await ac.newPage();
await step("ADMIN: login → dashboard → platforms", async () => {
  await a.goto("/login"); await a.getByRole("button", { name: "Admin", exact: true }).click(); await a.getByRole("button", { name: "Sign in", exact: true }).click(); await a.waitForURL(/admin$/); await h1(a);
  await a.goto("/admin/platforms"); await h1(a); await a.getByRole("row", { name: /ACCA/ }).first().waitFor();
});
await step("ADMIN: subject → topic → material → question bank (2 questions) → test builder → publish", async () => {
  await a.goto("/admin/subjects"); await a.getByRole("button", { name: "Add subject" }).click(); await a.locator("#f-code").fill(CODE); await a.locator("#f-name").fill(SUB); await a.locator("#f-level").selectOption({ label: "ACCA — Applied Knowledge" }); await save(a); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/topics"); await a.getByRole("button", { name: "Add topic" }).click(); await a.locator("#f-title").fill(TOPIC); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-durationMinutes").fill("10"); await a.locator("#f-lessonCount").fill("1"); await save(a); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill(NOTES); await a.locator("#f-kind").selectOption("notes"); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: TOPIC }); await a.locator("#f-body").fill("Journey notes for the final regression."); await save(a); await a.getByText("Saved.").waitFor();
  for (const [i, q] of [["1", `What is 2 + 2 (journey ${TAG})?`], ["2", `Which letter is B (journey ${TAG})?`]]) {
    await a.goto("/admin/question-bank"); await a.getByRole("button", { name: "Add question" }).click(); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: `${CODE} · ${TOPIC}` });
    await a.locator("#f-text").fill(q); for (const [k, v] of [["A", "Alpha"], ["B", "Bravo"], ["C", "Charlie"], ["D", "Delta"]]) await a.locator(`#f-option${k}`).fill(v);
    await a.locator("#f-correct").selectOption("b"); await a.locator("#f-explanation").fill(`Bravo is the right answer to question ${i}.`); await a.locator("#f-points").fill("1"); await a.locator("#f-difficulty").selectOption("easy"); await save(a); await a.getByText("Saved.").waitFor();
  }
  await a.goto("/admin/tests"); await a.getByRole("button", { name: "Add test" }).click(); await a.locator("#f-title").fill(TEST); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: TOPIC }); await a.locator("#f-durationMinutes").fill("5"); await a.locator("#f-passMark").fill("50");
  await a.getByRole("button", { name: "Add questions" }).click(); const picker = a.getByRole("dialog").filter({ hasText: "Published questions of the selected subject" }); await picker.getByText(/What is 2 \+ 2/).click(); await picker.getByText(/Which letter is B/).click(); await picker.getByRole("button", { name: /Add selected \(2\)/ }).click();
  await a.locator("#f-published").click(); await save(a); await a.getByText("Saved.").waitFor();
});

// ═════════════ NEW LEARNER ═════════════
const lc = await ctx(); const l = await lc.newPage();
const email = `journey.${Date.now()}@example.com`;
await step("GUEST: home → all courses → ACCA → subject → topic → locked material → sign-in dialog → register → dashboard", async () => {
  await l.goto("/"); await h1(l); await l.getByRole("link", { name: "View courses" }).first().click(); await l.waitForURL(/\/all-courses$/);
  await l.locator("[data-platform-section=acca]").waitFor(); await l.goto(`/subject/${CODE.toLowerCase()}`); await h1(l);
  await l.locator("[data-topic-row] button").first().click(); await l.waitForTimeout(350); await l.locator("[data-material-row] button").first().click();
  await l.getByRole("dialog").getByText("To study this material, sign in to your account.").waitFor(); await l.getByRole("dialog").getByRole("link", { name: "Sign in" }).click(); await l.waitForURL(/\/login\?next=/);
  await l.getByRole("link", { name: /Register|Create/i }).first().click(); await l.waitForURL(/\/register/);
  await l.locator("#reg-name").fill("Journey Learner"); await l.locator("#reg-email").fill(email); await l.locator("#reg-password").fill("Journey-pass123"); await l.locator("#reg-confirm").fill("Journey-pass123"); await l.locator("#reg-terms").click();
  await l.getByRole("button", { name: "Create account" }).click(); await l.waitForURL((u) => /\/(dashboard|subject)/.test(u.pathname), { timeout: 15000 });
  await l.goto("/dashboard"); await h1(l);
});
await step("LEARNER: platform (enrol) → subject → topic → material → mark completed", async () => {
  await l.goto("/courses"); await l.getByRole("button", { name: "Enroll (free in demo)" }).first().click(); await l.getByText("Enrolled").first().waitFor();
  await l.goto("/platform/acca"); await h1(l); await l.goto(`/subject/${CODE.toLowerCase()}`); await h1(l);
  await l.getByRole("link", { name: new RegExp(TOPIC) }).first().click(); await l.getByRole("link", { name: new RegExp(NOTES) }).first().click(); await l.waitForURL(/\/material\//);
  await l.getByRole("button", { name: "Mark as completed" }).click(); await l.getByRole("button", { name: "Completed" }).waitFor(); await l.waitForLoadState("networkidle");
});
await step("LEARNER: test → submit → result → progress → ranking", async () => {
  await l.goto("/exams"); await l.getByRole("link", { name: TEST }).click(); await l.waitForURL(/\/test\//);
  await l.getByRole("button", { name: /Start test|Resume test/ }).click(); await l.getByText("Question 1 of 2").waitFor();
  await l.getByRole("radio").nth(1).click(); await l.getByRole("button", { name: "Next", exact: true }).click(); await l.getByRole("radio").nth(1).click();
  await l.getByRole("button", { name: "Submit test" }).first().click(); await l.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await l.waitForURL(/\/result/);
  await l.getByText("100%").first().waitFor(); await l.locator("#review").getByText("Explanation").first().waitFor();
  await l.goto("/progress"); await h1(l); await l.getByText(new RegExp(TEST)).first().waitFor(); await l.goto("/ranking"); await h1(l); await l.getByText("Journey Learner").first().waitFor();
});
await step("LEARNER: finishing the only topic issues the certificate → download PDF → public verification", async () => {
  await l.goto("/certificates"); const card = l.locator("[data-certificate-card=earned]"); await card.getByText(new RegExp(`${CODE} — ${SUB}`)).waitFor(); await card.getByRole("link").first().click(); await l.locator("[data-certificate]").waitFor();
  const href = await l.getByRole("link", { name: "Download PDF" }).getAttribute("href"); const pdf = await lc.request.get(href); assert(pdf.status() === 200 && (await pdf.body()).slice(0, 5).toString() === "%PDF-", "certificate PDF");
  const verify = await l.getByRole("link", { name: "Public verification page" }).getAttribute("href"); const g = await ctx(); const v = await g.newPage(); await v.goto(verify); await v.locator("[data-verify-status=issued]").waitFor(); assert(/Journey L\./.test(await v.locator("main").innerText()), "holder abbreviated"); await g.close();
});

// ═════════════ ADMIN (continued) ═════════════
await step("ADMIN: students → statistics → certificates → notifications → settings", async () => {
  await a.goto("/admin/students"); await h1(a); await a.getByText("Journey Learner").first().waitFor();
  await a.goto("/admin/statistics"); await a.locator("[data-stats-cards]").waitFor();
  await a.goto("/admin/certificates"); await h1(a); await a.locator("table").getByText(new RegExp(CODE)).first().waitFor();
  await a.goto("/admin/notifications"); await h1(a); await a.goto("/admin/settings"); await h1(a);
});

// ═════════════ PAYMENT ═════════════
await step("PAYMENT: paid platform → purchase → pending → provider → verified event → paid → enrolment → access", async () => {
  await a.goto("/admin/platforms"); await a.getByRole("button", { name: /^Edit: FIA$/ }).click(); await a.locator("#f-price").fill("29"); await save(a); await a.getByText("Saved.").waitFor();
  await l.goto("/platform/fia"); await l.getByText("Enroll to access FIA").waitFor(); await l.getByRole("button", { name: /Buy access — \$29\.00/ }).click(); await l.waitForURL(/demo-checkout/);
  await l.goto("/payments"); await l.getByRole("row", { name: /FIA — full access.*Pending/ }).waitFor();
  await l.goto("/platform/fia"); assert((await l.getByText("Enroll to access FIA").count()) === 1, "access before payment");
  await l.goBack().catch(() => {}); await l.goto("/courses"); await l.getByRole("button", { name: /Buy access/ }).click(); await l.waitForURL(/demo-checkout/);
  await l.getByRole("button", { name: "Simulate successful payment" }).click(); await l.waitForURL(/payments\?paid=/); await l.getByText("Payment confirmed — your access is active.").waitFor();
  await l.getByRole("row", { name: /FIA — full access.*Paid/ }).waitFor(); await l.goto("/platform/fia"); await h1(l); assert((await l.getByText("Enroll to access FIA").count()) === 0, "no access after payment");
  await a.goto("/admin/access"); await a.getByRole("row", { name: /Journey Learner.*FIA/ }).getByText("Payment").waitFor();
  await a.goto("/admin/statistics"); await a.locator("[data-stats-cards]").waitFor(); assert(/\$29\.00/.test(await a.locator("[data-stats-cards]").innerText()), "revenue in statistics");
});

await browser.close();
const failed = results.filter((r) => !r[1]).length; console.log(`\n${results.length - failed}/${results.length} steps passed`); process.exit(failed ? 1 : 0);
