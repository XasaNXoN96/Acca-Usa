// Responsive audit: horizontal overflow, clipped elements and small touch targets on key pages at 12 widths (315 … 1920).
//   BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/audit-responsive.mjs [extra paths…]   (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const WIDTHS = [315, 320, 360, 390, 412, 480, 768, 820, 1024, 1280, 1440, 1920];
const T1 = "bt-business-organisations-and-their-stakeholders";
const PUBLIC = ["/", "/all-courses", "/acca", "/fia", "/subject/bt", "/books", "/forums", "/search", "/login", "/register", "/terms", "/privacy", "/cookies", "/refunds"];
const STUDENT = ["/dashboard", "/notes", "/mistakes", "/courses", "/platform/acca", "/subject/bt", `/subject/bt/topic/${T1}`, `/subject/bt/topic/${T1}/material/${T1}-notes`, `/subject/bt/topic/${T1}/material/${T1}-video`, `/subject/bt/topic/${T1}/material/${T1}-pdf`, `/subject/bt/topic/${T1}/material/${T1}-audio`, `/subject/bt/topic/${T1}/material/${T1}-diagram`, `/subject/bt/topic/${T1}/material/${T1}-glossary`, "/exams", "/progress", "/ranking", "/ranking?platform=acca&subject=bt", "/certificates", "/certificates/cert-demo-bt", "/notifications", "/payments", "/profile"];
const ADMIN = ["/admin", "/admin/platforms", "/admin/subjects", "/admin/topics", "/admin/materials", "/admin/question-bank", "/admin/tests", "/admin/exams", "/admin/students", "/admin/payments", "/admin/security", "/admin/audit", "/admin/certificates", "/admin/notifications", "/admin/statistics", "/admin/statistics?subject=bt", "/admin/settings"];
const extra = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let problems = 0, checks = 0;

async function login(who) {
  const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
  const p = await c.newPage(); await p.goto("/login");
  await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(who === "Admin" ? /admin$/ : /dashboard$/);
  const state = await c.storageState(); await c.close(); return state;
}
const states = { public: undefined, student: await login("Student"), admin: await login("Admin") };

async function scan(role, paths) {
  for (const w of WIDTHS) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: w < 600 ? 800 : 900 }, hasTouch: w < 1024, storageState: states[role] });
    await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
    const p = await c.newPage();
    for (const path of paths) {
      checks++;
      const res = await p.goto(path, { waitUntil: "load" }).catch(() => null);
      await p.waitForTimeout(150);
      if (!res || res.status() >= 400) { problems++; console.log(`✗ ${role} ${w} ${path}: HTTP ${res?.status()}`); continue; }
      const r = await p.evaluate((touch) => {
        const out = [];
        const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (over > 0) out.push(`horizontal overflow ${over}px`);
        for (const el of document.querySelectorAll("main *, header *, footer *")) {
          const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
          const b = el.getBoundingClientRect(); if (b.width === 0 || b.height === 0) continue;
          const clipped = (() => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== "visible" && p.getBoundingClientRect().right <= innerWidth + 1) return true; } return false; })();
          if (b.right > innerWidth + 1 && !clipped && !el.closest("[data-overflow-ok], .overflow-x-auto, table, pre, [role=tablist]")) { out.push(`outside viewport: <${el.tagName.toLowerCase()}> ${(el.className?.toString() || "").slice(0, 50)} right=${Math.round(b.right)}`); break; }
        }
        if (touch) for (const el of document.querySelectorAll("a[href], button:not([disabled])")) {
          const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
          const b = el.getBoundingClientRect(); if (!b.width || !b.height || b.bottom < 0 || b.top > 4000) continue;
          if (el.closest("p, li > p") && cs.display === "inline") continue; // inline text links
          if (el.classList.contains("sr-only") || el.closest(".sr-only")) continue;
          if (Math.min(b.width, b.height) < 23.5) { out.push(`tiny target ${Math.round(b.width)}x${Math.round(b.height)} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`); break; }
        }
        return out;
      }, w < 1024);
      if (r.length) { problems++; console.log(`✗ ${role} ${w} ${path}: ${r.join("; ")}`); }
    }
    await c.close();
  }
}
await scan("public", PUBLIC);
await scan("student", [...STUDENT, ...extra.filter((x) => !x.startsWith("/admin"))]);
await scan("admin", [...ADMIN, ...extra.filter((x) => x.startsWith("/admin"))]);
await browser.close();
console.log(`\nresponsive audit: ${checks} page×width checks, ${problems} problems`);
process.exit(problems ? 1 : 0);
