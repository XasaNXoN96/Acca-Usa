// Administrator second factor. BASE_URL=... CHROMIUM=... node scripts/smoke-mfa.mjs  (fresh server, after `npm run build`; runs on both providers)
import { chromium } from "playwright-core";
import { createHmac } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let n = 0; // each browser context gets its own client address so the per-client sign-in limit does not mask what is being tested
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.9.0.${++n}` } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const status = async (c, url) => (await c.request.get(url, { maxRedirects: 0 })).status();
const location = async (c, url) => (await c.request.get(url, { maxRedirects: 0 })).headers().location ?? "";

// RFC 6238 (SHA-1, 6 digits, 30 s) — an independent implementation, so the app's own TOTP code is checked against it.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const ch of s) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const code = (secret, offset = 0) => { const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset)); const h = createHmac("sha1", b32(secret)).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); };
const signIn = async (p, who = "Admin") => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };

let secret = ""; let recovery = [];
const older = await ctx(); const op = await older.newPage(); await signIn(op); await op.waitForURL(/\/admin$/); // a session that exists BEFORE enrolment

const ac = await ctx(); const a = await ac.newPage(); await signIn(a); await a.waitForURL(/\/admin$/);
await step("1 admin without MFA (demo mode) can open Security and sees the enrolment screen with QR + manual key", async () => {
  await a.goto("/admin/security"); await a.getByRole("heading", { name: "Set up two-step verification" }).waitFor();
  assert((await a.locator("img[alt*='QR']").count()) === 1, "QR missing");
  secret = (await a.getByTestId("mfa-secret").innerText()).trim(); assert(/^[A-Z2-7]{32}$/.test(secret), `secret shape ${secret}`);
  await a.reload(); assert((await a.getByTestId("mfa-secret").innerText()).trim() === secret, "secret must be stable while enrolment is pending");
});
await step("2 a wrong code does not enable MFA; the right code does and shows 10 single-use recovery codes", async () => {
  await a.locator("#mfa-confirm").fill(code(secret) === "000000" ? "111111" : "000000"); await a.getByRole("button", { name: "Confirm and enable" }).click();
  await a.getByText(/not valid/).waitFor();
  await a.locator("#mfa-confirm").fill(code(secret)); await a.getByRole("button", { name: "Confirm and enable" }).click();
  await a.getByTestId("recovery-codes").waitFor(); recovery = (await a.getByTestId("recovery-codes").locator("li").allInnerTexts()).map((s) => s.trim());
  assert(recovery.length === 10 && new Set(recovery).size === 10, `recovery codes: ${recovery.length}`);
  await a.getByRole("button", { name: /continue/ }).click(); await a.getByRole("heading", { name: "Two-step verification is on" }).waitFor();
  assert((await a.locator("main").innerText()).includes("Unused recovery codes: 10"), "recovery counter");
});
await step("3 enrolment revoked the older session and re-issued the current one as verified", async () => {
  assert((await location(older, "/admin")).includes("/login"), "pre-enrolment session still works");
  assert((await status(ac, "/admin")) === 200, "current session should still work");
});

const pwOnly = async () => { const c = await ctx(); const p = await c.newPage(); await signIn(p); await p.waitForURL(/login\/mfa/); return { c, p }; };
await step("4 password alone gives NO session: /admin, files and the session cookie are all refused while the code is pending", async () => {
  const { c } = await pwOnly();
  const names = (await c.cookies()).map((k) => k.name);
  assert(!names.includes("acca_session"), "a session cookie was issued before the second factor");
  assert(names.includes("acca_mfa"), "challenge cookie missing");
  assert((await location(c, "/admin")).includes("/login"), "/admin reachable with the password only");
  assert((await location(c, "/admin/payments")).includes("/login"), "/admin/payments reachable");
  await c.close();
});
await step("5 the pending-challenge token cannot be used as a session (separate signing domain), and tampering is rejected", async () => {
  const { c } = await pwOnly();
  const pending = (await c.cookies()).find((k) => k.name === "acca_mfa").value;
  const c2 = await ctx(); await c2.addCookies([{ name: "acca_session", value: pending, url: BASE }]);
  assert((await location(c2, "/admin")).includes("/login"), "challenge token accepted as a session");
  const p2 = await c2.newPage(); await p2.goto("/dashboard"); assert(p2.url().includes("/login"), "student area accepted the challenge token");
  const c3 = await ctx(); await c3.addCookies([{ name: "acca_mfa", value: pending.slice(0, -2) + "xx", url: BASE }]);
  const p3 = await c3.newPage(); await p3.goto("/login/mfa"); assert(!p3.url().includes("/login/mfa"), "tampered challenge accepted");
  await c.close(); await c2.close(); await c3.close();
});
await step("6 /login/mfa without a password step goes back to sign-in", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/login/mfa"); assert(/\/login$/.test(p.url()), p.url()); await c.close();
});

let usedCode = "";
await step("7 a wrong code is refused; a correct code signs in; admin pages open", async () => {
  const { c, p } = await pwOnly();
  await p.locator("#mfa-code").fill("123456"); if (code(secret) === "123456") throw new Error("unlucky collision"); await p.getByRole("button", { name: "Verify" }).click(); await p.getByText("That code is not valid.").waitFor();
  usedCode = code(secret, 1); // next step: the enrolment consumed the current one (replay protection)
  await p.locator("#mfa-code").fill(usedCode); await p.getByRole("button", { name: "Verify" }).click(); await p.waitForURL(/\/admin$/);
  assert((await status(c, "/admin/payments")) === 200, "admin pages after MFA");
  await c.close();
});
await step("8 the same code cannot be replayed", async () => {
  const { c, p } = await pwOnly();
  await p.locator("#mfa-code").fill(usedCode); await p.getByRole("button", { name: "Verify" }).click(); await p.getByText("That code is not valid.").waitFor();
  assert(!(await c.cookies()).some((k) => k.name === "acca_session"), "replayed code produced a session");
  await c.close();
});
await step("9 a recovery code works once, then is burned", async () => {
  const { c, p } = await pwOnly(); await p.locator("#mfa-code").fill(recovery[0]); await p.getByRole("button", { name: "Verify" }).click(); await p.waitForURL(/\/admin$/); await c.close();
  const again = await pwOnly(); await again.p.locator("#mfa-code").fill(recovery[0]); await again.p.getByRole("button", { name: "Verify" }).click(); await again.p.getByText("That code is not valid.").waitFor();
  await again.c.close();
});
await step("10 student sign-in is unaffected by the administrator's second factor", async () => {
  const c = await ctx(); const p = await c.newPage(); await signIn(p, "Student"); await p.waitForURL(/dashboard$/); assert((await status(c, "/admin")) === 307, "student reached admin"); await c.close();
});
await step("11 guessing is rate-limited: repeated wrong codes lock the challenge, even a correct code afterwards", async () => {
  const { c, p } = await pwOnly();
  for (let i = 0; i < 7; i++) { await p.locator("#mfa-code").fill("000001"); await p.getByRole("button", { name: "Verify" }).click(); await p.waitForTimeout(250); }
  await p.locator("#mfa-code").fill(code(secret, -1)); await p.getByRole("button", { name: "Verify" }).click(); await p.getByText(/Too many attempts/).waitFor();
  assert(!(await c.cookies()).some((k) => k.name === "acca_session"), "rate-limited challenge issued a session");
  await c.close();
});

await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
