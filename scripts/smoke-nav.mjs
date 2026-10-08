// Responsive navigation smoke test: sidebar (≥1024) vs. Menu drawer (<1024) for student and admin shells.
//   BASE_URL=http://localhost:3100 CHROMIUM=/path/to/chrome node scripts/smoke-nav.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const sizes = [360, 390, 768, 1024, 1280, 1440];
const accounts = { student: ["student@example.com", "Student-Demo1", "/dashboard"], admin: ["admin@example.com", "Admin-Demo1", "/admin"] };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("  FAIL", m); } };

for (const [who, [email, pw, home]] of Object.entries(accounts)) {
  const lc = await browser.newContext({ baseURL: BASE }); const lp = await lc.newPage();
  await lp.goto("/login"); await lp.locator("#login-email").fill(email); await lp.locator("#login-password").fill(pw);
  await lp.locator("form button[type=submit]").click(); await lp.waitForURL(/dashboard|admin/);
  const state = await lc.storageState(); await lc.close();

  for (const w of sizes) {
    const c = await browser.newContext({ viewport: { width: w, height: 800 }, baseURL: BASE, storageState: state, hasTouch: w < 1024 });
    const p = await c.newPage(); await p.goto(home, { waitUntil: "networkidle" });
    const sidebar = p.locator("aside").first(); const menuBtn = p.getByRole("button", { name: "Open menu" });
    const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (w >= 1024) {
      ok(await sidebar.isVisible(), `${who} ${w}: sidebar should be visible`);
      ok((await sidebar.boundingBox())?.width >= 230, `${who} ${w}: sidebar should be full width`);
      ok(await sidebar.getByText(/\S/).first().isVisible(), `${who} ${w}: sidebar labels visible`);
      ok(!(await menuBtn.isVisible()), `${who} ${w}: hamburger should be hidden`);
    } else {
      ok(!(await sidebar.isVisible()), `${who} ${w}: sidebar must be collapsed`);
      ok(await menuBtn.isVisible(), `${who} ${w}: Menu button must be visible`);
      const box = await menuBtn.boundingBox(); ok(box && box.width >= 40 && box.height >= 40, `${who} ${w}: Menu button too small`);
      await menuBtn.click();
      const dlg = p.getByRole("dialog"); await dlg.waitFor();
      const links = dlg.getByRole("navigation").getByRole("link"); const n = await links.count();
      ok(n >= 8, `${who} ${w}: drawer should list all items (got ${n})`);
      for (let i = 0; i < n; i++) { const l = links.nth(i); ok((await l.innerText()).trim().length > 0 && (await l.isVisible()), `${who} ${w}: item ${i} has no visible label`); }
      await p.waitForTimeout(500); // let the slide-in animation finish
      const db = await dlg.boundingBox(); ok(db && db.x >= 0 && db.x + db.width <= w + 1, `${who} ${w}: drawer exceeds viewport`);
      ok(await dlg.getByRole("button", { name: "Close menu" }).isVisible(), `${who} ${w}: close (X) missing`);
      ok((await overflow()) <= 0, `${who} ${w}: horizontal overflow while open`);
      // overlay click closes
      await p.mouse.click(w - 4, 400); await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${who} ${w}: overlay click did not close`));
      // X closes
      await menuBtn.click(); await dlg.waitFor(); await dlg.getByRole("button", { name: "Close menu" }).click();
      await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${who} ${w}: X did not close`));
      // navigating closes the drawer and lands on the page
      await menuBtn.click(); await dlg.waitFor();
      const target = dlg.getByRole("navigation").getByRole("link").nth(1); const href = await target.getAttribute("href");
      await target.click(); await p.waitForURL((u) => u.pathname === href, { timeout: 10000 }).catch(() => ok(false, `${who} ${w}: did not navigate to ${href}`));
      await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${who} ${w}: drawer stayed open after navigation`));
      // clicking the CURRENT page link also closes it
      await menuBtn.click(); await dlg.waitFor(); await dlg.getByRole("navigation").getByRole("link").nth(1).click();
      await dlg.waitFor({ state: "hidden", timeout: 3000 }).catch(() => ok(false, `${who} ${w}: drawer stayed open after same-page click`));
    }
    ok((await overflow()) <= 0, `${who} ${w}: horizontal overflow`);
    await c.close();
    console.log(`  checked ${who} @ ${w}px`);
  }
}
await browser.close();
console.log(fails ? `\n${fails} problem(s)` : "\nnavigation smoke: all OK"); process.exit(fails ? 1 : 0);
