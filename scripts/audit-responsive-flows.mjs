// Responsive audit of INTERACTIVE states: modals, forms, the test player, result and certificate screens.
//   BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/audit-responsive-flows.mjs   (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const WIDTHS = [360, 390, 412, 768, 1024, 1280, 1440];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let problems = 0, checks = 0;

async function login(who) {
  const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
  const p = await c.newPage(); await p.goto("/login");
  await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(who === "Admin" ? /admin$/ : /dashboard$/);
  const state = await c.storageState(); await c.close(); return state;
}
const states = { guest: undefined, student: await login("Student"), admin: await login("Admin") };

/** Generic checks for the current page state; `scope` optionally narrows the viewport check to a dialog. */
async function audit(p, w, name) {
  checks++;
  const issues = await p.evaluate(({ touch }) => {
    const out = [];
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (over > 0) out.push(`horizontal overflow ${over}px`);
    const dlg = document.querySelector("[role=dialog]");
    if (dlg) {
      const b = dlg.getBoundingClientRect();
      if (b.left < -1 || b.right > innerWidth + 1) out.push(`dialog outside viewport (${Math.round(b.left)}..${Math.round(b.right)})`);
      if (b.height > innerHeight + 1 && getComputedStyle(dlg).overflowY === "visible") out.push("dialog taller than the screen and not scrollable");
    }
    const root = dlg ?? document;
    for (const el of root.querySelectorAll("a[href], button:not([disabled]), input:not([type=hidden]), select, textarea")) {
      const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (el.classList.contains("sr-only") || el.closest(".sr-only") || el.closest("[aria-hidden=true]")) continue;
      if (b.right > innerWidth + 1 && !el.closest(".overflow-x-auto, table, [role=tablist]")) { out.push(`control outside viewport: ${(el.textContent || el.getAttribute("aria-label") || el.id || el.tagName).trim().slice(0, 30)}`); break; }
      if (touch && Math.min(b.width, b.height) < 23.5 && !(el.closest("p") && cs.display === "inline")) { out.push(`tiny target ${Math.round(b.width)}x${Math.round(b.height)} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`); break; }
    }
    return out;
  }, { touch: w < 1024 });
  if (issues.length) { problems++; console.log(`✗ ${w}px · ${name}: ${issues.join("; ")}`); }
}
const T1 = "bt-business-organisations-and-their-stakeholders";
const ctxFor = async (role, w) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: w < 600 ? 800 : 900 }, hasTouch: w < 1024, storageState: states[role] }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const esc = async (p) => { for (let i = 0; i < 4 && (await p.getByRole("dialog").count()) > 0; i++) { await p.keyboard.press("Escape"); await p.waitForTimeout(200); } };

for (const w of WIDTHS) {
  // ---- guest: locked material modal ----
  { const c = await ctxFor("guest", w); const p = await c.newPage(); await p.goto("/subject/bt"); await p.locator("[data-topic-row] button").first().click(); await p.waitForTimeout(350); await audit(p, w, "guest · opened topic accordion");
    await p.locator("[data-material-row] button").first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(250); await audit(p, w, "guest · locked material modal"); await c.close(); }

  // ---- student: test player, dialogs, result, certificate, ranking, notifications ----
  { const c = await ctxFor("student", w); const p = await c.newPage();
    await p.goto("/test/bt-stakeholders-test"); await p.getByRole("button", { name: /Start test|Resume test/ }).waitFor(); await audit(p, w, "student · test intro");
    await p.getByRole("button", { name: /Start test|Resume test/ }).click(); await p.getByText(/Question \d+ of 8/).waitFor(); await p.waitForTimeout(300); await audit(p, w, "student · test player");
    const tb = await p.getByRole("timer").boundingBox(); checks++; if (!tb || tb.x < 0 || tb.x + tb.width > w || tb.y < 0) { problems++; console.log(`✗ ${w}px · test timer not fully visible`); }
    await p.getByRole("radio").first().click(); await p.getByRole("button", { name: "Exit test" }).click(); await p.getByRole("dialog").waitFor(); await audit(p, w, "student · exit dialog"); await esc(p);
    await p.getByRole("button", { name: "Submit test" }).first().click(); await p.getByRole("dialog").waitFor(); await audit(p, w, "student · submit dialog"); await p.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await p.waitForURL(/result/); await p.waitForTimeout(300); await audit(p, w, "student · result + review");
    await p.goto("/certificates/cert-demo-bt"); await p.locator("[data-certificate]").waitFor(); await audit(p, w, "student · certificate");
    await p.goto("/ranking"); await audit(p, w, "student · ranking"); await p.goto("/notifications"); await audit(p, w, "student · notifications");
    await p.goto(`/subject/bt/topic/${T1}`); await audit(p, w, "student · topic with test card + materials");
    await c.close(); }

  // ---- admin: forms, pickers, previews ----
  { const c = await ctxFor("admin", w); const p = await c.newPage();
    await p.goto("/admin/question-bank"); await p.getByRole("button", { name: "Add question" }).click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(250); await audit(p, w, "admin · question form"); await esc(p);
    await p.getByRole("button", { name: /^Preview:/ }).first().click(); await p.getByRole("dialog").waitFor(); await audit(p, w, "admin · question preview"); await esc(p);
    await p.goto("/admin/tests"); await p.getByRole("button", { name: "Add test" }).click(); await p.getByRole("dialog").waitFor(); await p.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await audit(p, w, "admin · test builder form");
    await p.getByRole("button", { name: "Add questions" }).click(); await p.waitForTimeout(250); await audit(p, w, "admin · question picker"); await esc(p);
    await p.getByRole("button", { name: /^Preview: Stakeholders/ }).first().click(); await p.getByRole("dialog").waitFor(); await p.getByRole("button", { name: "Start preview" }).click(); await p.waitForTimeout(250); await audit(p, w, "admin · test preview player"); await esc(p);
    await p.goto("/admin/certificates"); await p.getByRole("button", { name: /^Preview:/ }).first().click(); await p.getByRole("dialog").waitFor(); await p.waitForTimeout(250); await audit(p, w, "admin · certificate preview"); await esc(p);
    await p.goto("/admin/statistics"); await audit(p, w, "admin · statistics"); await p.goto("/admin/notifications"); await audit(p, w, "admin · notifications");
    await c.close(); }
}
await browser.close();
console.log(`\nresponsive flows audit: ${checks} checks, ${problems} problems`);
process.exit(problems ? 1 : 0);
