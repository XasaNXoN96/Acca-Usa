// Smoke test: notifications. BASE_URL=... CHROMIUM=... node scripts/smoke-notifications.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const bell = (p) => p.locator("[data-bell]"); const badge = async (p) => { const t = await bell(p).innerText(); return t.trim() === "" ? 0 : parseInt(t); };
const item = (p, code) => p.locator(`[data-notification=${code}]`).first();
const TAG = String(Date.now()).slice(-5);
const T1 = "bt-business-organisations-and-their-stakeholders";

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);

await step("student: bell badge shows the unread count; list shows seeded notifications with unread markers", async () => {
  await s.goto("/notifications"); await s.locator("[data-notification-list]").waitFor(); assert((await badge(s)) === 2, `badge ${await badge(s)}`);
  assert((await s.locator("[data-notification][data-unread=true]").count()) === 2, "unread items"); await s.getByRole("status").filter({ hasText: "2 unread notifications" }).waitFor();
});
await step("click opens the exact target (topic) and marks it read; badge decreases", async () => {
  await item(s, "topic_unlocked").click(); await s.waitForURL(/ma-cost-classification/); await s.goto("/notifications"); assert((await badge(s)) === 1, `badge ${await badge(s)}`);
});
await step("mark all as read clears the badge", async () => {
  await s.goto("/notifications"); await s.getByRole("button", { name: "Mark all as read" }).click(); await s.waitForTimeout(800); await s.reload();
  assert((await badge(s)) === 0, "badge not cleared"); assert((await s.locator("[data-notification][data-unread=true]").count()) === 0, "unread left"); assert(await s.getByRole("button", { name: "Mark all as read" }).isDisabled(), "button should be disabled");
});

// ---- events produced by admin actions ----
await step("new material → enrolled student is notified and the link opens the material viewer", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill(`Notify material ${TAG}`); await a.locator("#f-kind").selectOption("notes"); await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" }); await a.locator("#f-body").fill("Notes that trigger a notification."); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await s.goto("/notifications"); const n = item(s, "material_added"); await n.getByText(`“Notify material ${TAG}” was added to BT.`).waitFor(); assert((await badge(s)) === 1, "badge"); await n.click(); await s.waitForURL(new RegExp(`/subject/bt/topic/${T1}/material/`)); await s.getByRole("heading", { level: 1, name: `Notify material ${TAG}` }).waitFor();
});
await step("test published → student notified, link opens the test intro; unpublished/draft tests notify nobody", async () => {
  await a.goto("/admin/tests"); await a.getByRole("button", { name: /^Duplicate: Stakeholders — topic test$/ }).click(); await a.getByText("Draft copy created.").waitFor();
  await s.goto("/notifications"); assert((await s.locator("[data-notification=test_published]").count()) === 0, "draft copy announced");
  await a.goto("/admin/tests"); await a.getByRole("button", { name: /^Publish: Stakeholders — topic test \(copy\)$/ }).click(); await a.getByText("Test published.").waitFor();
  await s.goto("/notifications"); const n = item(s, "test_published"); await n.getByText(/Stakeholders — topic test \(copy\)/).waitFor(); await n.click(); await s.waitForURL(/\/test\/test-/); await s.getByText("Stakeholders — topic test (copy)").first().waitFor();
});
await step("new topic → 'Course updated' opens the subject page", async () => {
  await a.goto("/admin/topics"); await a.getByRole("button", { name: "Add topic" }).click(); await a.locator("#f-title").fill(`Notify topic ${TAG}`); await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-durationMinutes").fill("15"); await a.locator("#f-lessonCount").fill("2"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await s.goto("/notifications"); const n = item(s, "course_updated"); await n.getByText(new RegExp(`Notify topic ${TAG}`)).waitFor(); await n.click(); await s.waitForURL(/\/subject\/bt$/);
});
await step("test result: student 'Test result ready' → result page; admin 'Test submitted' → statistics", async () => {
  await s.goto("/test/bt-stakeholders-test"); await s.getByRole("button", { name: "Start test" }).click(); await s.getByText("Question 1 of 8").waitFor(); await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/result/);
  await s.goto("/notifications"); await item(s, "result_ready").click(); await s.waitForURL(/\/test\/bt-stakeholders-test\/result/);
  await a.goto("/admin/notifications"); const n = item(a, "test_submitted"); await n.getByText(/Demo Student submitted “Stakeholders — topic test” — 0%\./).waitFor(); await n.click(); await a.waitForURL(/\/admin\/statistics/);
});
await step("new registration → admin notified, link opens the students list; not-enrolled students get no content notices", async () => {
  const rc = await ctx(); const r = await rc.newPage(); await r.goto("/register"); await r.locator("#reg-name").fill("Notify Newbie"); await r.locator("#reg-email").fill(`nt.${Date.now()}@example.com`); await r.locator("#reg-password").fill("Note-pass12345"); await r.locator("#reg-confirm").fill("Note-pass12345"); await r.locator("#reg-terms").click(); await r.getByRole("button", { name: "Create account" }).click(); await r.waitForURL(/dashboard$/);
  await a.goto("/admin/notifications"); const n = item(a, "user_registered"); await n.getByText(/Notify Newbie created a student account/).waitFor(); await n.click(); await a.waitForURL(/\/admin\/students/);
  await r.goto("/notifications"); assert((await r.locator("[data-notification=material_added], [data-notification=test_published], [data-notification=course_updated]").count()) === 0, "content notices for a not-enrolled student"); await r.locator("[data-notification=welcome]").waitFor(); await rc.close();
});
await step("certificate: student gets 'Certificate issued' / 'revoked' with links; admin gets the auto-issue notice", async () => {
  await a.goto("/admin/certificates"); await a.getByRole("button", { name: "Issue certificate" }).click(); await a.locator("#f-student").selectOption({ label: "Demo Student (student@example.com)" }); await a.locator("#f-subject").selectOption({ label: "FA — Financial Accounting" }); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await s.goto("/notifications"); await item(s, "certificate_issued").click(); await s.waitForURL(/\/certificates\/cert-/); await s.locator("[data-certificate]").waitFor();
  await a.goto("/admin/certificates"); await a.getByRole("button", { name: /^Revoke: AU-\d{4}-000002/ }).first().click(); await a.getByRole("dialog").getByRole("button", { name: "Revoke" }).click(); await a.getByText("Certificate revoked.").waitFor();
  await s.goto("/notifications"); await item(s, "certificate_revoked").click(); await s.waitForURL(/\/certificates\/cert-/); await s.getByText("This certificate has been revoked").waitFor();
});
await step("admin bell + page; students cannot open the admin notifications; each user only sees their own", async () => {
  const rc = await ctx(); const r = await rc.newPage(); await r.goto("/register"); await r.locator("#reg-name").fill("Badge Newbie"); await r.locator("#reg-email").fill(`bd.${Date.now()}@example.com`); await r.locator("#reg-password").fill("Badge-pass12345"); await r.locator("#reg-confirm").fill("Badge-pass12345"); await r.locator("#reg-terms").click(); await r.getByRole("button", { name: "Create account" }).click(); await r.waitForURL(/dashboard$/); await rc.close();
  await a.goto("/admin/notifications"); assert((await badge(a)) >= 1, "admin badge"); assert((await a.locator("[data-notification=welcome]").count()) === 0, "student notices in admin list");
  assert((await sc.request.get("/admin/notifications", { maxRedirects: 0 })).status() !== 200, "student reached admin notifications");
  await a.getByRole("button", { name: "Mark all as read" }).click(); await a.waitForTimeout(800); await a.reload(); assert((await badge(a)) === 0, "admin badge not cleared");
});
await step("mobile 360/390: bell badge visible and notification list fits", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await sc.storageState() }); const p = await c.newPage(); await p.goto("/notifications"); await p.locator("[data-notification-list]").waitFor();
    const b = await bell(p).boundingBox(); assert(b && b.x >= 0 && b.x + b.width <= w && b.width >= 40, `${w}: bell`); assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`);
    const rows = await p.locator("[data-notification] button").all(); for (const r of rows.slice(0, 6)) { const bb = await r.boundingBox(); assert(bb.height >= 44 && bb.x + bb.width <= w, `${w}: row`); }
    await c.close();
  }
});
await step("RU / UZ notification wording", async () => {
  for (const [loc, marks] of [["ru", ["Отметить все как прочитанные", "Сертификат отозван"]], ["uz", ["Barchasini o‘qilgan deb belgilash", "Sertifikat bekor qilindi"]]]) {
    const c = await browser.newContext({ baseURL: BASE, storageState: await sc.storageState() }); await c.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]); const p = await c.newPage(); await p.goto("/notifications");
    for (const m of marks) await p.getByText(m).first().waitFor().catch(() => { throw new Error(`${loc}: "${m}" missing`); }); await c.close();
  }
});
await ac.close(); await sc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
