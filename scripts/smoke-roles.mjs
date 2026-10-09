// Smoke test: only two roles (STUDENT, ADMIN). BASE_URL=... CHROMIUM=... node scripts/smoke-roles.mjs (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who, btn = "Sign in") => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: btn, exact: true }).click(); };

await step("login page: Demo Student + Demo Admin only, no Teacher (EN/RU/UZ)", async () => {
  for (const [loc, student, admin] of [["en", "Student", "Admin"], ["ru", "Студент", "Администратор"], ["uz", "Talaba", "Administrator"]]) {
    const c = await ctx({ locale: loc }); const p = await c.newPage(); await p.goto("/login");
    assert(!/teacher|учитель|o‘qituvchi/i.test(await p.locator("main").innerText()), `${loc}: teacher text`);
    assert((await p.getByRole("button", { name: student, exact: true }).count()) === 1 && (await p.getByRole("button", { name: admin, exact: true }).count()) === 1, `${loc}: demo buttons`);
    assert((await p.getByRole("button", { name: "Teacher" }).count()) === 0, `${loc}: teacher button`);
    await c.close();
  }
});
await step("Demo Student → /dashboard; /admin redirects to /dashboard; logout and login again", async () => {
  const c = await ctx(); const p = await c.newPage(); await demo(p, "Student"); await p.waitForURL(/\/dashboard$/);
  await p.goto("/admin"); await p.waitForURL(/\/dashboard$/); await p.goto("/admin/students"); await p.waitForURL(/\/dashboard$/);
  assert((await p.request.get("/api/uploads/x")).status() !== 200, "student reached uploads");
  await p.getByRole("button", { name: /Demo Student|Account|Profile/i }).first().click().catch(() => {});
  await p.getByRole("menuitem", { name: /Sign out|Log out/i }).click(); await p.waitForURL((u) => /\/(login)?$/.test(u.pathname));
  await p.goto("/dashboard"); await p.waitForURL(/\/login/);
  await demo(p, "Student"); await p.waitForURL(/\/dashboard$/); await c.close();
});
await step("Demo Admin → /admin; may open student dashboard", async () => {
  const c = await ctx(); const p = await c.newPage(); await demo(p, "Admin"); await p.waitForURL(/\/admin$/);
  await p.goto("/dashboard"); await p.waitForURL(/\/dashboard$/); await c.close();
});
await step("teacher@example.com cannot log in; tampered cookie with TEACHER/ADMIN claim is rejected", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/login");
  await p.locator("#login-email, input[type=email]").first().fill("teacher@example.com"); await p.locator("input[type=password]").first().fill("Teacher-Demo1");
  await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.getByText("Incorrect email or password.").waitFor();
  await c.addCookies([{ name: "acca_session", value: "eyJyb2xlIjoiQURNSU4ifQ.forged", url: BASE }]);
  await p.goto("/admin"); await p.waitForURL(/\/login/); await c.close();
});
await step("registration creates a STUDENT (→ dashboard, no /admin); no role field in the form", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/register");
  assert((await p.locator("select, [name=role]").count()) === 0, "role field on register");
  await p.locator("#reg-name").fill("Role Tester"); await p.locator("#reg-email").fill(`role.${Date.now()}@example.com`);
  await p.locator("#reg-password").fill("Role-pass123"); await p.locator("#reg-confirm").fill("Role-pass123"); await p.locator("#reg-terms").click(); await p.locator("#reg-privacy").click();
  await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/\/dashboard$/);
  await p.goto("/admin"); await p.waitForURL(/\/dashboard$/); await c.close();
});
await step("admin user management: role selector offers only Student and Admin; table has no Teacher", async () => {
  const c = await ctx(); const p = await c.newPage(); await demo(p, "Admin"); await p.waitForURL(/\/admin$/);
  await p.goto("/admin/students");
  assert(!/teacher/i.test(await p.locator("main").innerText()), "Teacher in users table");
  await p.getByRole("button", { name: /Invite user|Add user/ }).click();
  const opts = (await p.locator("#f-role option").allTextContents()).map((x) => x.trim()).filter((x) => x && x !== "—");
  assert(JSON.stringify(opts) === JSON.stringify(["Student", "Admin"]), `roles: ${opts}`); await c.close();
});
await step("mobile (360/390): login page shows two demo buttons and Student login works", async () => {
  for (const w of [360, 390]) {
    const c = await ctx({ viewport: { width: w, height: 800 }, hasTouch: true }); const p = await c.newPage(); await p.goto("/login");
    assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`);
    assert((await p.getByRole("button", { name: "Teacher" }).count()) === 0, "teacher btn");
    await demo(p, "Student"); await p.waitForURL(/\/dashboard$/); await c.close();
  }
});
await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
