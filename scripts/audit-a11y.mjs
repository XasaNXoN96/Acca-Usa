// Accessibility audit with axe-core (WCAG 2.0/2.1 A + AA) on key pages, light AND dark theme, plus keyboard checks.
//   BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/audit-a11y.mjs   (fresh server)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const T1 = "bt-business-organisations-and-their-stakeholders";
const PUBLIC = ["/", "/all-courses", "/acca", "/fia", "/subject/bt", "/books", "/forums", "/search?q=cost", "/login", "/register", "/forgot-password", "/verify/certificate/AU-2026-000001"];
const STUDENT = ["/dashboard", "/courses", "/platform/acca", "/subject/bt", `/subject/bt/topic/${T1}`, `/subject/bt/topic/${T1}/material/${T1}-notes`, "/test/bt-stakeholders-test", "/exams", "/progress", "/ranking", "/certificates", "/payments", "/notifications", "/profile"];
const ADMIN = ["/admin", "/admin/platforms", "/admin/subjects", "/admin/topics", "/admin/materials", "/admin/question-bank", "/admin/tests", "/admin/students", "/admin/access", "/admin/payments", "/admin/certificates", "/admin/statistics", "/admin/settings"];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let problems = 0, checks = 0;

async function login(who) {
  const c = await browser.newContext({ baseURL: BASE });
  const p = await c.newPage(); await p.goto("/login");
  await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(who === "Admin" ? /admin$/ : /dashboard$/);
  const st = await c.storageState(); await c.close(); return st;
}
const states = { public: undefined, student: await login("Student"), admin: await login("Admin") };

async function scan(role, paths, theme) {
  const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, storageState: states[role], colorScheme: theme });
  await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
  const p = await c.newPage();
  for (const path of paths) {
    checks++;
    const res = await p.goto(path, { waitUntil: "load" }).catch(() => null);
    await p.waitForLoadState("networkidle").catch(() => {});
    if (!res || res.status() >= 500) { problems++; console.log(`✗ ${theme} ${role} ${path}: HTTP ${res?.status()}`); continue; }
    await p.evaluate(axeSource);
    const out = await p.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] }));
    for (const v of out.violations) {
      problems++;
      console.log(`✗ ${theme} ${role} ${path}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].target.join(" ")} | ${v.nodes[0].html.slice(0, 110).replace(/\s+/g, " ")}`);
    }
  }
  await c.close();
}
for (const theme of ["light", "dark"]) {
  await scan("public", PUBLIC, theme);
  await scan("student", STUDENT, theme);
  await scan("admin", ADMIN, theme);
}

// Keyboard: skip link is the first tab stop and moves focus to main; the mobile menu opens with the keyboard and closes with Escape.
{
  const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); const p = await c.newPage(); await p.goto("/");
  checks++; await p.keyboard.press("Tab"); const first = await p.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  if (!/skip/i.test(first)) { problems++; console.log(`✗ keyboard: first tab stop is "${first}", expected a skip link`); }
  else { await p.keyboard.press("Enter"); const inMain = await p.evaluate(() => !!document.activeElement?.closest("main") || document.activeElement?.id === "main" || location.hash === "#main"); if (!inMain) { problems++; console.log("✗ keyboard: skip link does not reach main"); } }
  await c.close();
  const m = await browser.newContext({ baseURL: BASE, viewport: { width: 390, height: 800 }, hasTouch: true }); const mp = await m.newPage(); await mp.goto("/");
  checks++; await mp.getByRole("button", { name: /open menu/i }).focus(); await mp.keyboard.press("Enter"); const dialog = mp.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) { problems++; console.log("✗ keyboard: mobile menu did not open"); }
  else { await mp.keyboard.press("Escape"); await mp.waitForTimeout(500); if (await dialog.isVisible().catch(() => false)) { problems++; console.log("✗ keyboard: Escape does not close the mobile menu"); } }
  await m.close();
}
await browser.close();
console.log(`\naccessibility audit: ${checks} checks, ${problems} problems`);
process.exit(problems ? 1 : 0);
