#!/usr/bin/env node
/**
 * Registration / sign-up probe (browser-driven). For a LOCAL or STAGING server only — it creates throw-away student accounts.
 *   BASE=http://127.0.0.1:3300 CHROMIUM=/opt/pw-browsers/chromium node scripts/registration-probe.mjs
 * Each case uses its own fake client address (X-Forwarded-For) so the rate limiter does not interfere, except the last one.
 */
import { chromium } from "playwright-core";
const BASE = (process.env.BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
const run = Date.now().toString(36);
let n = 0, failed = 0, ipSeq = 10;
const ok = (name, cond, extra = "") => { n++; if (cond) console.log("  ok  ", name); else { failed++; console.log("  FAIL", name, extra); } };

async function ctx(locale = "en") {
  const c = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${ipSeq++}` } });
  await c.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }]);
  return c;
}
async function fill(p, { name = "Probe User", email, password = "Zebra-lamp-4821", confirm, terms = true, privacy = true }) {
  await p.goto("/register");
  await p.locator("#reg-name").fill(name); await p.locator("#reg-email").fill(email);
  await p.locator("#reg-password").fill(password); await p.locator("#reg-confirm").fill(confirm ?? password);
  if (terms) await p.locator("#reg-terms").click();
  if (privacy) await p.locator("#reg-privacy").click();
  await p.getByRole("button", { name: /Create account|Создать|Hisob/ }).click();
}
const landed = (p) => p.waitForURL(/\/dashboard|\/consent/, { timeout: 15000 }).then(() => true, () => false);
const stays = async (p) => { await p.waitForTimeout(1500); return /\/register/.test(p.url()); };

// 1 normal registration + cookie flags
{
  const c = await ctx(); const p = await c.newPage();
  await fill(p, { email: `normal.${run}@probe.example` });
  ok("normal registration lands on the dashboard", await landed(p));
  const s = (await c.cookies()).find((x) => x.name === "acca_session");
  ok("session cookie is HttpOnly + SameSite", !!s && s.httpOnly && /Lax|Strict/.test(s.sameSite), JSON.stringify(s && { h: s.httpOnly, s: s.sameSite }));
  await c.close();
}
// 2 stored-XSS attempt in the name: shown as text, never as markup
{
  const c = await ctx(); const p = await c.newPage(); let dialog = false; p.on("dialog", () => { dialog = true; });
  await fill(p, { name: `<img src=x onerror=alert(1)>${run}`, email: `xss.${run}@probe.example` });
  await landed(p); await p.goto("/profile"); await p.waitForTimeout(800);
  ok("HTML in the name is escaped (no element, no alert)", !dialog && (await p.locator("img[src='x']").count()) === 0);
  await c.close();
}
// 3 duplicate e-mail, case-insensitive
{
  const c = await ctx(); const p = await c.newPage();
  await fill(p, { email: `DUPE.${run}@probe.example` }); await landed(p); await c.close();
  const c2 = await ctx(); const p2 = await c2.newPage();
  await fill(p2, { email: `dupe.${run}@probe.example` });
  ok("same e-mail in another letter case is refused", await stays(p2) && (await p2.getByText(/already exists/i).count()) > 0);
  await c2.close();
}
// 4 plus-addressing accepted
{ const c = await ctx(); const p = await c.newPage(); await fill(p, { email: `plus+tag.${run}@probe.example` }); ok("plus-addressed e-mail is accepted", await landed(p)); await c.close(); }
// 5 weak / common / mismatching passwords, short and long names, bad e-mail, missing consents
const bad = [
  ["common password refused", { email: `c1.${run}@probe.example`, password: "password123" }],
  ["8-char all-letters password refused", { email: `c2.${run}@probe.example`, password: "abcdefgh" }],
  ["password and confirmation must match", { email: `c3.${run}@probe.example`, confirm: "Zebra-lamp-4822" }],
  ["1-letter name refused", { email: `c4.${run}@probe.example`, name: "A" }],
  ["81-letter name refused", { email: `c5.${run}@probe.example`, name: "A".repeat(81) }],
  ["malformed e-mail refused", { email: "not-an-email" }],
  ["255-character e-mail refused", { email: `${"a".repeat(245)}@probe.example` }],
  ["terms not accepted → refused", { email: `c6.${run}@probe.example`, terms: false }],
  ["privacy consent not given → refused", { email: `c7.${run}@probe.example`, privacy: false }],
];
for (const [label, data] of bad) { const c = await ctx(); const p = await c.newPage(); await fill(p, data); ok(label, await stays(p)); await c.close(); }
// 6 hostile but legal text is stored as data, the database keeps working
{
  const c = await ctx(); const p = await c.newPage();
  await fill(p, { name: `Robert'); DROP TABLE "User";-- ${run}`, email: `sql.${run}@probe.example` });
  ok("SQL-looking name is accepted as plain text", await landed(p)); await c.close();
  const c2 = await ctx(); const p2 = await c2.newPage();
  await fill(p2, { email: `after.sql.${run}@probe.example` });
  ok("the user table still works afterwards", await landed(p2)); await c2.close();
}
// 7 Unicode e-mail must not crash the server
{ const c = await ctx(); const p = await c.newPage(); await fill(p, { email: `тест.${run}@пример.рф` }); await p.waitForTimeout(1500); ok("unicode e-mail: handled without a server error", (await p.locator("text=/Application error|500/").count()) === 0); await c.close(); }
// 8 localisation: errors in Russian and Uzbek
for (const [loc, rx] of [["ru", /[а-яё]/i], ["uz", /(parol|talab|noto|kamida|kerak|hisob)/i]]) {
  const c = await ctx(loc); const p = await c.newPage(); await p.goto("/register"); await p.locator("#reg-name").fill("A"); await p.locator("#reg-email").fill("x"); await p.locator("#reg-password").fill("1");
  await p.locator("button[type=submit]").first().click(); await p.waitForTimeout(800);
  ok(`${loc}: validation messages are localised`, rx.test(await p.locator("main").innerText())); await c.close();
}
// 9 anonymous password reset gives the same answer for known and unknown e-mails (no enumeration there)
{
  const texts = [];
  for (const email of [`normal.${run}@probe.example`, `nobody.${run}@probe.example`]) {
    const c = await ctx(); const p = await c.newPage(); await p.goto("/forgot-password"); await p.locator("input[type=email]").fill(email); await p.locator("button[type=submit]").click(); await p.waitForTimeout(1500);
    texts.push((await p.locator("main").innerText()).replace(/\s+/g, " ").replace(email, "<email>")); await c.close();
  }
  ok("forgot-password answers identically for existing and unknown e-mails", texts[0] === texts[1], `\n   ${texts[0].slice(0, 120)}\n   ${texts[1].slice(0, 120)}`);
}
// 10 rate limit: many registrations from ONE address are throttled
{
  const c = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.250" } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
  let limited = false;
  for (let i = 0; i < 14 && !limited; i++) {
    const p = await c.newPage(); await c.clearCookies(); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]);
    await fill(p, { email: `rl${i}.${run}@probe.example` }); await p.waitForTimeout(700);
    limited = (await p.getByText(/too many|try again/i).count()) > 0; await p.close();
  }
  ok("repeated sign-ups from one address are rate limited", limited); await c.close();
}
await browser.close();
console.log(failed ? `\n${failed} of ${n} checks FAILED` : `\nall ${n} registration checks passed`);
process.exit(failed ? 1 : 0);
