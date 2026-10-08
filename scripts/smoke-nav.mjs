// Responsive navigation smoke test for the collapsible sidebar (student + admin shells).
//   BASE_URL=http://localhost:3100 CHROMIUM=/path/to/chrome node scripts/smoke-nav.mjs
// ≥768px: permanent sidebar, open ↔ collapsed (animated), tooltips, persistence.  <768px: Menu drawer.
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const sizes = [360, 390, 768, 1024, 1280, 1440];
const accounts = { student: ["student@example.com", "Student-Demo1", "/dashboard"], admin: ["admin@example.com", "Admin-Demo1", "/admin"] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("  FAIL", m); } };
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

for (const [who, [email, pw, home]] of Object.entries(accounts)) {
  const lc = await browser.newContext({ baseURL: BASE }); const lp = await lc.newPage();
  await lp.goto("/login"); await lp.locator("#login-email").fill(email); await lp.locator("#login-password").fill(pw);
  await lp.locator("form button[type=submit]").click(); await lp.waitForURL(/dashboard|admin/);
  const state = await lc.storageState(); await lc.close();

  for (const w of sizes) {
    const tag = `${who} ${w}`;
    const c = await browser.newContext({ viewport: { width: w, height: 800 }, baseURL: BASE, storageState: state, hasTouch: w < 1024 });
    const p = await c.newPage(); await p.goto(home, { waitUntil: "networkidle" });
    const aside = p.locator("aside.sb-aside"); const menuBtn = p.getByRole("button", { name: "Open menu" });
    const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const asideW = async () => (await aside.boundingBox())?.width ?? 0;
    const contentPad = () => p.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".sb-content")).paddingLeft));
    const labelOpacity = () => p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("aside .sb-label")).opacity));

    if (w >= 768) {
      ok(await aside.isVisible(), `${tag}: sidebar visible`);
      ok(!(await menuBtn.isVisible()), `${tag}: hamburger hidden (sidebar fits)`);
      const defaultOpen = w >= 1024;
      ok(near(await asideW(), defaultOpen ? 240 : 72), `${tag}: default width ${defaultOpen ? "open 240" : "collapsed 72"} (got ${await asideW()})`);
      const toggle = p.getByRole("button", { name: /Collapse sidebar|Expand sidebar/ });
      ok(await toggle.isVisible(), `${tag}: edge toggle visible`);
      ok((await toggle.getAttribute("aria-expanded")) === String(defaultOpen), `${tag}: aria-expanded matches state`);

      for (const [step, wantOpen] of [["toggle 1", !defaultOpen], ["toggle 2", defaultOpen]]) {
        await toggle.click(); await p.waitForTimeout(450);
        const wd = await asideW();
        ok(near(wd, wantOpen ? 240 : 72), `${tag} ${step}: width ${wantOpen ? "240" : "72"} (got ${wd})`);
        ok(near(await contentPad(), wd), `${tag} ${step}: content reflows to sidebar width`);
        ok(wantOpen ? (await labelOpacity()) > 0.95 : (await labelOpacity()) < 0.05, `${tag} ${step}: labels ${wantOpen ? "visible" : "hidden"}`);
        ok((await toggle.getAttribute("aria-expanded")) === String(wantOpen), `${tag} ${step}: aria-expanded`);
        const active = aside.locator('a[aria-current="page"]'); ok((await active.count()) === 1 && (await active.isVisible()), `${tag} ${step}: active item visible`);
        ok((await overflow()) <= 0, `${tag} ${step}: horizontal overflow`);
        // icons stay put: x of first icon identical in both states
        const ix = await aside.locator("nav a svg").first().evaluate((e) => Math.round(e.getBoundingClientRect().x));
        if (step === "toggle 1") globalThis.__ix = ix; else ok(Math.abs(ix - globalThis.__ix) <= 1, `${tag}: icons moved (${globalThis.__ix} → ${ix})`);
      }

      // collapsed: tooltip on hover/focus; state persists across navigation and reload
      await toggle.click(); await p.waitForTimeout(450);
      const collapsedNow = near(await asideW(), 72);
      if (collapsedNow) {
        const item = aside.locator("nav a").nth(2); const name = (await item.innerText()).trim();
        await item.hover(); await p.getByRole("tooltip").filter({ hasText: name }).first().waitFor({ timeout: 3000 }).catch(() => ok(false, `${tag}: tooltip "${name}" not shown on hover`));
        await p.mouse.move(700, 600);
        await item.focus(); await p.keyboard.press("Tab"); await item.focus();
        await p.getByRole("tooltip").filter({ hasText: name }).first().waitFor({ timeout: 3000 }).catch(() => ok(false, `${tag}: tooltip not shown on keyboard focus`));
      }
      const target = aside.locator("nav a").nth(1); const href = await target.getAttribute("href");
      await target.click(); await p.waitForURL((u) => u.pathname === href, { timeout: 10000 }).catch(() => ok(false, `${tag}: navigation failed`));
      await p.waitForTimeout(300);
      ok(near(await asideW(), collapsedNow ? 72 : 240), `${tag}: state kept after navigation`);
      ok((await aside.locator('a[aria-current="page"]').count()) === 1, `${tag}: active item after navigation`);
      await p.reload({ waitUntil: "networkidle" });
      ok(near(await asideW(), collapsedNow ? 72 : 240), `${tag}: state kept after reload (cookie)`);
      ok((await overflow()) <= 0, `${tag}: overflow after reload`);
    } else {
      ok(!(await aside.isVisible()), `${tag}: permanent sidebar hidden on phones`);
      ok(await menuBtn.isVisible(), `${tag}: Menu button visible`);
      await menuBtn.click(); const dlg = p.getByRole("dialog"); await dlg.waitFor(); await p.waitForTimeout(500);
      const n = await dlg.getByRole("navigation").getByRole("link").count(); ok(n >= 8, `${tag}: drawer lists all items (${n})`);
      const db = await dlg.boundingBox(); ok(db && db.x >= 0 && db.x + db.width <= w + 1, `${tag}: drawer within viewport`);
      ok((await overflow()) <= 0, `${tag}: overflow with drawer open`);
      await p.mouse.click(w - 4, 400); await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${tag}: overlay click did not close`));
      await menuBtn.click(); await dlg.waitFor(); await dlg.getByRole("button", { name: "Close menu" }).click();
      await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${tag}: X did not close`));
      await menuBtn.click(); await dlg.waitFor(); const t = dlg.getByRole("navigation").getByRole("link").nth(1); const href = await t.getAttribute("href");
      await t.click(); await p.waitForURL((u) => u.pathname === href, { timeout: 10000 }).catch(() => ok(false, `${tag}: drawer navigation failed`));
      await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${tag}: drawer open after navigation`));
    }
    ok((await overflow()) <= 0, `${tag}: horizontal overflow`);
    await c.close(); console.log(`  checked ${tag}px`);
  }
}
await browser.close();
console.log(fails ? `\n${fails} problem(s)` : "\nnavigation smoke: all OK"); process.exit(fails ? 1 : 0);
