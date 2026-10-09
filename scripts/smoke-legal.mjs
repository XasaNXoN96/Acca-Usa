// Legal pages and consent. BASE_URL=... CHROMIUM=... node scripts/smoke-legal.mjs  (fresh server, after `npm run build`; runs on both providers)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let n = 0;
const ctx = async (locale = "en") => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.7.0.${++n}` } }); await c.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const status = async (c, url) => (await c.request.get(url, { maxRedirects: 0 })).status();
const location = async (c, url) => (await c.request.get(url, { maxRedirects: 0 })).headers().location ?? "";

await step("1 Terms, Privacy, Cookie and Refund pages are public in EN / RU / UZ, with the draft notice and explicit 'not configured' markers (no invented company)", async () => {
  const titles = { en: ["Terms of Use", "Privacy Policy", "Cookie Notice", "Refund Policy"], ru: ["Условия использования", "Политика конфиденциальности", "Уведомление о cookie", "Политика возврата"], uz: ["Foydalanish shartlari", "Maxfiylik siyosati", "Cookie xabarnomasi", "Pulni qaytarish siyosati"] };
  for (const loc of ["en", "ru", "uz"]) {
    const c = await ctx(loc); const p = await c.newPage();
    for (const [i, path] of ["/terms", "/privacy", "/cookies", "/refunds"].entries()) {
      const r = await p.goto(path); assert(r.status() === 200, `${loc} ${path} → ${r.status()}`);
      await p.locator("[data-legal-document]").waitFor(); const text = await p.locator("[data-legal-document]").innerText();
      assert(text.includes(titles[loc][i]), `${loc} ${path}: title missing`);
      assert((await p.locator("[data-legal-draft]").count()) === 1, `${loc} ${path}: draft notice missing`);
      assert(!/\{\w+\}/.test(text), `${loc} ${path}: unfilled placeholder`);
      assert(!/CIMA|TODO|lorem/i.test(text), `${loc} ${path}: junk`);
    }
    await p.goto("/terms"); assert(/not configured|не указано|ko‘rsatmagan/.test(await p.locator("[data-legal-document]").innerText()), `${loc}: operator details should be marked as not configured`);
    await c.close();
  }
});
await step("2 the footer links to all four texts on public pages", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/");
  for (const [label, href] of [["Terms of Use", "/terms"], ["Privacy Policy", "/privacy"], ["Cookie Notice", "/cookies"], ["Refund Policy", "/refunds"]]) assert((await p.locator(`footer a[href='${href}']`, { hasText: label }).count()) === 1, `footer link ${href}`);
  await c.close();
});
await step("3 the cookie notice lists every cookie the site really sets", async () => {
  const c = await ctx(); const p = await c.newPage(); await demo(p, "Student"); await p.waitForURL(/dashboard$/);
  await p.getByRole("button", { name: /theme|appearance/i }).first().click().catch(() => {});
  const names = (await c.cookies()).map((k) => k.name); assert(names.includes("acca_session") && names.includes("NEXT_LOCALE"), `cookies: ${names}`);
  await p.goto("/cookies"); const text = await p.locator("[data-legal-document]").innerText();
  for (const name of names) assert(text.includes(name), `cookie ${name} is set but not documented`);
  assert(!/google-analytics|_ga|_fbp|ads/i.test(names.join()), "tracking cookie present"); await c.close();
});
const email = `legal.${Date.now()}@example.com`;
await step("4 registration needs BOTH separate consents; marketing is optional and never pre-ticked; the documents open in a new tab", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/register");
  assert(!(await p.locator("#reg-marketing").isChecked()) && !(await p.locator("#reg-terms").isChecked()) && !(await p.locator("#reg-privacy").isChecked()), "a consent box is pre-ticked");
  for (const href of ["/terms", "/privacy"]) { const a = p.locator(`label a[href='${href}']`).first(); assert((await a.getAttribute("target")) === "_blank" && /noopener/.test(await a.getAttribute("rel")), `${href} link`); }
  await p.locator("#reg-name").fill("Legal Probe"); await p.locator("#reg-email").fill(email); await p.locator("#reg-password").fill("Legal-pass123456"); await p.locator("#reg-confirm").fill("Legal-pass123456");
  await p.locator("#reg-terms").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.getByText(/Consent to personal data processing is required/).waitFor();
  assert(/register/.test(p.url()), "registered with only the terms ticked");
  await p.locator("#reg-terms").uncheck(); await p.locator("#reg-privacy").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.getByText(/must accept the terms/i).waitFor();
  await p.locator("#reg-terms").click(); await p.locator("#reg-marketing").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard$/);
  await p.goto("/profile"); const card = p.locator("[data-privacy-card]");
  assert(/Accepted version/.test(await card.locator("[data-consent-kind='terms']").innerText()) && /Accepted version/.test(await card.locator("[data-consent-kind='privacy']").innerText()), "profile does not show the accepted versions");
  assert(await p.locator("#pref-marketing").isChecked(), "marketing choice was not stored");
  await p.locator("#pref-marketing").click(); await p.getByText("Saved.").waitFor(); await p.reload(); assert(!(await p.locator("#pref-marketing").isChecked()), "withdrawal not persisted");
  await c.close();
});
await step("5 an account created by an administrator has accepted nothing: first sign-in lands on the consent page, everything else is closed until it is accepted", async () => {
  const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/\/admin$/);
  const who = `byadmin.${Date.now()}@example.com`;
  await a.goto("/admin/students"); await a.getByRole("button", { name: /Invite user|Add user/ }).click();
  await a.locator("#f-name").fill("Invited Student"); await a.locator("#f-email").fill(who); await a.locator("#f-role").selectOption("STUDENT"); await a.locator("#f-status").selectOption("active"); await a.locator("#f-password").fill("Invited-pass12345");
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor(); await ac.close();

  const c = await ctx(); const p = await c.newPage(); await p.goto("/login"); await p.locator("#login-email").fill(who); await p.locator("#login-password").fill("Invited-pass12345"); await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForURL(/\/consent/); await p.getByRole("heading", { name: "Please review and accept" }).waitFor();
  for (const path of ["/dashboard", "/courses", "/profile", "/payments"]) assert((await location(c, path)).includes("/consent"), `${path} reachable without consent (${await status(c, path)})`);
  assert((await status(c, "/api/files/seed-bt-lecture")) === 401, "files reachable without consent");
  await p.getByRole("button", { name: "Accept and continue" }).click(); await p.getByText(/must accept the Terms of Use/).waitFor();
  await p.locator("#consent-terms").click(); await p.getByRole("button", { name: "Accept and continue" }).click(); await p.getByText(/Consent to personal data processing is required/).waitFor();
  assert(/consent/.test(p.url()), "continued with one consent missing");
  await p.locator("#consent-privacy").click(); await p.getByRole("button", { name: "Accept and continue" }).click(); await p.waitForURL(/dashboard$/);
  assert((await status(c, "/courses")) === 200, "closed after accepting"); assert((await location(c, "/consent")).includes("/dashboard"), "consent page should redirect once accepted");
  await c.close();
});
await step("6 'sign out instead' on the consent page ends the session", async () => {
  const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/\/admin$/);
  const who = `byadmin2.${Date.now()}@example.com`;
  await a.goto("/admin/students"); await a.getByRole("button", { name: /Invite user|Add user/ }).click();
  await a.locator("#f-name").fill("Invited Two"); await a.locator("#f-email").fill(who); await a.locator("#f-role").selectOption("STUDENT"); await a.locator("#f-status").selectOption("active"); await a.locator("#f-password").fill("Invited-pass12345");
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor(); await ac.close();
  const c = await ctx(); const p = await c.newPage(); await p.goto("/login"); await p.locator("#login-email").fill(who); await p.locator("#login-password").fill("Invited-pass12345"); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(/\/consent/);
  await p.getByRole("button", { name: "Sign out instead" }).click(); await p.waitForURL(/\/login/); assert((await location(c, "/consent")).includes("/login"), "session survived sign-out"); await c.close();
});
await step("7 a guest cannot use the consent page or its actions; the demo accounts are unaffected", async () => {
  const g = await ctx(); assert((await location(g, "/consent")).includes("/login"), "guest on /consent"); await g.close();
  const c = await ctx(); const p = await c.newPage(); await demo(p, "Student"); await p.waitForURL(/dashboard$/); assert((await status(c, "/consent")) === 307 && (await location(c, "/consent")).includes("/dashboard"), "demo accounts are asked for consent"); await c.close();
});

await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
