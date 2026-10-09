// Production-mode end-to-end check (separate bundle, real PostgreSQL, real SMTP wire protocol, signed payment webhooks).
//   npm run build:prod-test && PG_ADMIN_URL=postgresql://postgres@localhost:5433/postgres node scripts/test-production-mode.mjs
// Creates a throw-away database (acca_prod_test_<ts>) and drops it afterwards. Needs: psql, chromium, a local PostgreSQL.
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const ADMIN_URL = process.env.PG_ADMIN_URL ?? "postgresql://postgres@localhost:5433/postgres";
const DB = `acca_prod_test_${Date.now()}`;
const DB_URL = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`) + (ADMIN_URL.includes("?") ? "" : "?schema=public");
const PORT = "3102";
const BASE = `http://localhost:${PORT}`;
const SMTP_PORT = 2525;
const STRIPE_PORT = 12111;
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, 3).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const sh = (cmd, args, env = {}) => { const r = spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: "utf8" }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout).slice(0, 400)}`); return r.stdout; };

// ── a tiny SMTP sink: speaks enough SMTP for nodemailer and keeps what it receives
const mails = [];
const sink = net.createServer((sock) => {
  let data = ""; let inData = false; let buf = "";
  sock.write("220 sink ESMTP\r\n");
  sock.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) { if (line === ".") { inData = false; mails.push(data); data = ""; sock.write("250 queued\r\n"); } else data += `${line}\n`; continue; }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO" || cmd === "HELO") sock.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (cmd === "AUTH") sock.write("235 ok\r\n");
      else if (cmd === "MAIL" || cmd === "RCPT") sock.write("250 ok\r\n");
      else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
      else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
      else sock.write("250 ok\r\n");
    }
  });
  sock.on("error", () => {});
});
const decodeQp = (s) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const lastMail = async (containing) => { for (let i = 0; i < 40; i++) { const m = [...mails].reverse().find((x) => decodeQp(x).includes(containing)); if (m) return decodeQp(m); await sleep(250); } throw new Error(`no mail containing "${containing}"`); };

// ── a local TEST DOUBLE of the Stripe REST API (NOT Stripe): records what the server sends, returns a checkout session
const stripeCalls = [];
const fakeStripe = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/v1/checkout/sessions") {
      stripeCalls.push({ auth: req.headers.authorization, idem: req.headers["idempotency-key"], params: Object.fromEntries(new URLSearchParams(body)) });
      const id = `cs_test_${stripeCalls.length}`; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ id, url: `http://127.0.0.1:${STRIPE_PORT}/pay/${id}` }));
    } else if (req.method === "GET" && req.url?.startsWith("/pay/")) { res.setHeader("content-type", "text/html"); res.end("<title>Test double of Stripe Checkout</title><p>This is a local test double, not Stripe.</p>"); }
    else { res.statusCode = 404; res.end(); }
  });
});

const baseEnv = {
  NEXT_PUBLIC_APP_MODE: "production", NODE_ENV: "production", PORT,
  AUTH_SECRET: randomBytes(48).toString("base64"), DATA_PROVIDER: "prisma", DATABASE_URL: DB_URL, APP_URL: "https://acca.example",
  S3_BUCKET: "b", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_ENDPOINT: "http://127.0.0.1:9",
  LEGAL_OPERATOR_NAME: "Acca Test LLC", LEGAL_OPERATOR_ADDRESS: "1 Test Street, Tashkent", LEGAL_OPERATOR_TAX_ID: "123456789", LEGAL_CONTACT_EMAIL: "privacy@acca.example", LEGAL_DATA_LOCATION: "Test datacentre, Tashkent", LEGAL_GOVERNING_LAW: "Test law", LEGAL_REFUND_WINDOW: "14 days", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(SMTP_PORT), SMTP_USER: "smtp-user-77", SMTP_PASSWORD: "smtp-secret-pw-8231", EMAIL_FROM: "ACCA USA <no-reply@acca.example>",
  PAYMENT_SECRET_KEY: "sk_test_x", PAYMENT_WEBHOOK_SECRET: "whsec_prod_test", STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}/v1`,
};
const startServer = (env) => {
  const child = spawn("npx", ["next", "start", "-p", PORT], { env: { ...process.env, NEXT_DIST_DIR: ".next-prod", ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
  return { child, output: () => out, stop: () => { try { process.kill(-child.pid, "SIGTERM"); } catch { /* gone */ } } };
};
const waitUp = async (ms = 30000) => { for (let t = 0; t < ms; t += 500) { try { if ((await fetch(BASE)).status < 500) return true; } catch { /* not yet */ } await sleep(500); } return false; };
const waitDown = async () => { for (let i = 0; i < 40; i++) { try { await fetch(BASE, { signal: AbortSignal.timeout(800) }); } catch { return; } await sleep(250); } };

let server; let browser;
try {
  sh("psql", [ADMIN_URL, "-c", `CREATE DATABASE ${DB}`]);
  sh("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: DB_URL });
  sh("npx", ["tsx", "prisma/bootstrap.ts"], { DATABASE_URL: DB_URL });
  sh("npx", ["tsx", "scripts/create-admin.ts"], { DATABASE_URL: DB_URL, AUTH_SECRET: baseEnv.AUTH_SECRET, ADMIN_EMAIL: "owner@acca.example", ADMIN_NAME: "Site Owner", ADMIN_PASSWORD: "Owner-pass-12345" });
  await new Promise((r) => sink.listen(SMTP_PORT, "127.0.0.1", r));
  await new Promise((r) => fakeStripe.listen(STRIPE_PORT, "127.0.0.1", r));

  await step("startup validation: a production server with missing configuration refuses to start and names the variables (never values)", async () => {
    const blank = Object.fromEntries(Object.keys(baseEnv).map((k) => [k, ""]));
    const s = startServer({ ...blank, NEXT_PUBLIC_APP_MODE: "production", NODE_ENV: "production", PORT, AUTH_SECRET: "tooshort-secret-value", DATA_PROVIDER: "memory" });
    for (let i = 0; i < 60 && s.child.exitCode === null; i++) await sleep(500);
    const out = s.output(); s.stop(); await waitDown();
    assert(/Invalid environment \(production mode\)/.test(out), `no validation error: ${out.slice(0, 300)}`);
    for (const name of ["AUTH_SECRET", "DATA_PROVIDER", "DATABASE_URL", "APP_URL", "S3_BUCKET", "SMTP_HOST", "PAYMENT_WEBHOOK_SECRET"]) assert(out.includes(name), `${name} not listed`);
    assert(!out.includes("tooshort-secret-value"), "the secret value was echoed");
  });

  server = startServer(baseEnv);
  assert(await waitUp(), `server did not start: ${server.output().slice(0, 400)}`);
  browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = async () => browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });

  await step("no demo UI: login has no demo accounts, home has no demo labels, fake testimonials / statistics are gone", async () => {
    const c = await ctx(); const p = await c.newPage();
    await p.goto("/login"); const login = await p.locator("body").innerText(); assert(!/demo/i.test(login) && !login.includes("student@example.com") && !login.includes("Student-Demo1"), `login: ${login.slice(0, 200)}`);
    await p.goto("/"); const home = await p.locator("body").innerText(); assert(!/demo|placeholder|sample testimonials/i.test(home), `home mentions demo: ${(home.match(/.{30}demo.{30}/i) ?? [""])[0]}`);
    assert((await p.locator("#testimonials").count()) === 0, "testimonials section"); assert(!home.includes("10,000+"), "fake statistics");
    await c.close();
  });
  let studentCtx; let studentPage; let studentEmail;
  await step("register → real session cookie (httpOnly, Secure) → dashboard; welcome e-mail goes out over SMTP", async () => {
    studentCtx = await ctx(); studentPage = await studentCtx.newPage(); studentEmail = `learner.${Date.now()}@example.com`;
    await studentPage.goto("/register"); await studentPage.locator("#reg-name").fill("Prod Learner"); await studentPage.locator("#reg-email").fill(studentEmail);
    await studentPage.locator("#reg-password").fill("Learner-pass123"); await studentPage.locator("#reg-confirm").fill("Learner-pass123"); await studentPage.locator("#reg-terms").click(); await studentPage.locator("#reg-privacy").click();
    await studentPage.getByRole("button", { name: "Create account" }).click(); await studentPage.waitForURL(/dashboard$/);
    const cookie = (await studentCtx.cookies()).find((x) => x.name === "acca_session"); assert(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax", `cookie flags ${JSON.stringify(cookie)}`);
    const welcome = await lastMail("Prod Learner"); assert(/Welcome to ACCA USA/.test(welcome) && welcome.includes(studentEmail), "welcome mail");
    assert(!welcome.includes("Learner-pass123"), "password in e-mail");
  });
  await step("forgot password: identical answer, no on-screen link; the link arrives by e-mail, works once, old password stops working", async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto("/forgot-password"); await p.locator("#forgot-email").fill(studentEmail); await p.locator("button[type=submit]").click();
    await p.waitForLoadState("networkidle"); const body = await p.locator("body").innerText(); assert(!/token=/.test(body) && !/demo/i.test(body), `on-screen reset link: ${body.slice(0, 200)}`);
    const mail = await lastMail("reset-password?token="); const link = /https:\/\/acca\.example(\/reset-password\?token=[A-Za-z0-9_-]+)/.exec(mail)?.[1]; assert(link, "reset link in mail");
    await p.goto(link); await p.locator("#reset-password").fill("New-pass-45678"); await p.locator("#reset-confirm").fill("New-pass-45678"); await p.getByRole("button", { name: "Update password" }).click();
    await p.waitForURL(/login/); const again = await c.newPage(); await again.goto(link); await again.locator("#reset-password").fill("Other-pass-45678"); await again.locator("#reset-confirm").fill("Other-pass-45678"); await again.getByRole("button", { name: "Update password" }).click();
    await again.getByText(/invalid or has expired/i).waitFor(); // a used token is refused
    const oldSession = await studentPage.goto("/dashboard"); assert(/login/.test(studentPage.url()), `old session still valid after the reset (${oldSession?.status()} ${studentPage.url()})`);
    await c.close();
  });
  // ── administrator second factor (mandatory in production mode)
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const ch of s) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
  const hotpAt = (secret, stepNo) => { const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(stepNo)); const h = createHmac("sha1", b32(secret)).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); };
  let mfaSecret = null; let mfaLastStep = 0; let mfaRecovery = [];
  /** A code for the smallest accepted 30-second step that has not been used yet (the server rejects replays). */
  const freshCode = async () => { for (;;) { const now = Math.floor(Date.now() / 30000); for (let s = Math.max(now - 1, mfaLastStep + 1); s <= now + 1; s++) { mfaLastStep = s; return hotpAt(mfaSecret, s); } await sleep(1000); } };
  let adminIp = 0; // own client address per sign-in so the per-client login limit (8 / 10 min) does not mask what is tested
  const adminLogin = async () => {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.8.0.${++adminIp}` } }); const p = await c.newPage(); await p.goto("/login"); await p.locator("#login-email").fill("owner@acca.example"); await p.locator("#login-password").fill("Owner-pass-12345");
    const settle = async (re) => { await p.waitForURL(re); await p.waitForLoadState("networkidle"); }; // /admin may redirect on to /consent
    await p.getByRole("button", { name: "Sign in", exact: true }).click(); await settle(/admin|login\/mfa|consent/);
    if (p.url().includes("/login/mfa")) { await p.locator("#mfa-code").fill(await freshCode()); await p.getByRole("button", { name: "Verify" }).click(); await settle(/admin|consent/); }
    if (p.url().includes("/consent")) { await p.locator("#consent-terms").click(); await p.locator("#consent-privacy").click(); await p.getByRole("button", { name: "Accept and continue" }).click(); await settle(/admin/); }
    return { c, p };
  };
  await step("production: a new administrator gets NOTHING under /admin except mandatory two-step enrolment; after it, sign-in needs the code", async () => {
    const { c, p } = await adminLogin();
    for (const path of ["/admin", "/admin/payments", "/admin/settings", "/admin/students"]) {
      await p.goto(path); await p.getByRole("heading", { name: "Set up two-step verification" }).waitFor();
      assert((await p.locator("[data-payment-mode], [data-stats-cards], table").count()) === 0, `${path} rendered admin content before MFA`);
      assert((await p.locator("nav a[href^='/admin/']").count()) === 0, `${path} shows admin navigation before MFA`);
    }
    mfaSecret = (await p.getByTestId("mfa-secret").innerText()).trim();
    await p.locator("#mfa-confirm").fill(await freshCode()); await p.getByRole("button", { name: "Confirm and enable" }).click();
    await p.getByTestId("recovery-codes").waitFor(); mfaRecovery = (await p.getByTestId("recovery-codes").locator("li").allInnerTexts()).map((s) => s.trim()); assert(mfaRecovery.length === 10, "recovery codes");
    await p.getByRole("button", { name: /continue/ }).click(); await p.goto("/admin/security"); await p.getByRole("heading", { name: "Two-step verification is on" }).waitFor();
    const row = await db.user.findUnique({ where: { email: "owner@acca.example" } });
    assert(row.mfaEnabledAt && row.mfaSecretEnc && !row.mfaSecretEnc.includes(mfaSecret), "TOTP secret stored in clear");
    const hashes = await db.mfaRecoveryCode.findMany({ where: { userId: row.id } }); assert(hashes.length === 10 && hashes.every((h) => !mfaRecovery.some((r) => h.codeHash.includes(r.replace(/-/g, "")))), "recovery codes stored in clear");
    await c.close();
  });
  await step("admin:mfa-reset (operator CLI) removes the second factor and revokes sessions; the administrator is forced to enrol again", async () => {
    const live = await adminLogin(); // a verified session that must die with the reset
    const r = spawnSync("npx", ["tsx", "scripts/mfa-reset.ts"], { env: { ...process.env, DATABASE_URL: DB_URL, AUTH_SECRET: baseEnv.AUTH_SECRET, ADMIN_EMAIL: "owner@acca.example" }, encoding: "utf8" });
    assert(r.status === 0 && /Second factor removed/.test(r.stdout), `reset failed: ${r.stdout}${r.stderr}`);
    const bad = spawnSync("npx", ["tsx", "scripts/mfa-reset.ts"], { env: { ...process.env, DATABASE_URL: DB_URL, ADMIN_EMAIL: studentEmail }, encoding: "utf8" }); assert(bad.status !== 0, "mfa-reset accepted a student account");
    await live.p.goto("/admin/payments"); assert(live.p.url().includes("/login"), `old verified session survived the reset (${live.p.url()})`); await live.c.close();
    const row = await db.user.findUnique({ where: { email: "owner@acca.example" } }); assert(!row.mfaEnabledAt && !row.mfaSecretEnc && (await db.mfaRecoveryCode.count({ where: { userId: row.id } })) === 0, "MFA material left behind");
    mfaSecret = null; mfaLastStep = 0;
    const { c, p } = await adminLogin(); await p.getByRole("heading", { name: "Set up two-step verification" }).waitFor();
    mfaSecret = (await p.getByTestId("mfa-secret").innerText()).trim(); await p.locator("#mfa-confirm").fill(await freshCode()); await p.getByRole("button", { name: "Confirm and enable" }).click(); await p.getByTestId("recovery-codes").waitFor(); await c.close();
  });
  await step("admin created with admin:create can sign in with password + code; settings / statistics show no demo wording", async () => {
    const { c, p } = await adminLogin();
    assert(!/demo/i.test(await p.locator("main").innerText()), "demo wording on the admin dashboard");
    await p.goto("/admin/settings"); await p.getByText("Settings are configured by the deployment").waitFor(); await p.goto("/admin/statistics"); await p.locator("[data-stats-cards]").waitFor();
    assert(!/demo/i.test(await p.locator("main").innerText()), "demo wording on statistics"); await c.close();
  });
  await step("demo-only routes do not exist: demo checkout is 404; students cannot complete a payment themselves", async () => {
    await studentPage.goto("/login"); await studentPage.locator("#login-email").fill(studentEmail); await studentPage.locator("#login-password").fill("New-pass-45678"); await studentPage.getByRole("button", { name: "Sign in", exact: true }).click(); await studentPage.waitForURL(/dashboard$/);
    await studentPage.goto("/payments/demo-checkout/pay-anything"); await studentPage.getByText(/not found/i).first().waitFor();
    await studentPage.goto("/payments"); await studentPage.getByText(/payment provider/i).first().waitFor();
  });

  // ── real signed webhook path against the real database
  const user = await db.user.findUnique({ where: { email: studentEmail } });

  const adminCli = (env) => { const r = spawnSync("npx", ["tsx", "scripts/create-admin.ts"], { env: { ...process.env, DATABASE_URL: DB_URL, AUTH_SECRET: baseEnv.AUTH_SECRET, ...env }, encoding: "utf8" }); return { code: r.status, out: `${r.stdout}${r.stderr}` }; };
  await step("admin:create is safe: a second administrator / a student's e-mail are refused without an explicit flag; reset works and revokes sessions; the password is never printed", async () => {
    const other = adminCli({ ADMIN_EMAIL: "second@acca.example", ADMIN_PASSWORD: "Second-pass-12345" });
    assert(other.code === 3 && /administrator already exists/.test(other.out), `second admin: ${other.code} ${other.out}`); assert(!other.out.includes("Second-pass-12345"), "password printed");
    const student = adminCli({ ADMIN_EMAIL: studentEmail, ADMIN_PASSWORD: "Promote-pass-12345" }); assert(student.code === 3 && /student account/.test(student.out), `student: ${student.code} ${student.out}`);
    assert((await db.user.findUnique({ where: { email: studentEmail } })).role === "STUDENT", "the student was promoted without the flag");
    assert(adminCli({ ADMIN_EMAIL: "owner@acca.example", ADMIN_PASSWORD: "short" }).code === 1, "weak password accepted"); assert(adminCli({ ADMIN_EMAIL: "not-an-email", ADMIN_PASSWORD: "Whatever-pass-12345" }).code === 1, "bad e-mail accepted");
    const tv = (await db.user.findUnique({ where: { email: "owner@acca.example" } })).tokenVersion;
    const reset = adminCli({ ADMIN_EMAIL: "owner@acca.example", ADMIN_PASSWORD: "Owner-pass-67890" }); assert(reset.code === 0 && /password reset/.test(reset.out) && !reset.out.includes("Owner-pass-67890"), `reset: ${reset.out}`);
    assert((await db.user.findUnique({ where: { email: "owner@acca.example" } })).tokenVersion === tv + 1, "sessions of the reset administrator were not revoked");
    const c = await ctx(); const p = await c.newPage(); await p.goto("/login"); await p.locator("#login-email").fill("owner@acca.example"); await p.locator("#login-password").fill("Owner-pass-12345"); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.getByText(/incorrect|invalid/i).first().waitFor();
    assert(adminCli({ ADMIN_EMAIL: "owner@acca.example", ADMIN_PASSWORD: "Owner-pass-12345" }).code === 0, "restore"); await c.close();
    await db.user.create({ data: { name: "Promote Me", email: "promote.me@example.com", passwordHash: "x", role: "STUDENT", status: "active" } });
    const promote = adminCli({ ADMIN_EMAIL: "promote.me@example.com", ADMIN_PASSWORD: "Promote-pass-12345", ADMIN_PROMOTE_EXISTING: "1" }); assert(promote.code === 3 && /already exists/.test(promote.out), "promotion must still respect the single-admin rule");
    const both = adminCli({ ADMIN_EMAIL: "promote.me@example.com", ADMIN_PASSWORD: "Promote-pass-12345", ADMIN_PROMOTE_EXISTING: "1", ADMIN_ALLOW_ADDITIONAL: "1" }); assert(both.code === 0 && /promoted/.test(both.out), `explicit promotion: ${both.out}`);
    assert((await db.user.findUnique({ where: { email: "promote.me@example.com" } })).role === "ADMIN", "promotion not applied");
  });
  const secret = baseEnv.PAYMENT_WEBHOOK_SECRET;
  const post = async (event, { sign = true, stale = false } = {}) => {
    const body = JSON.stringify(event); const t = Math.floor(Date.now() / 1000) - (stale ? 3600 : 0);
    const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    return fetch(`${BASE}/api/webhooks/payments`, { method: "POST", body, headers: sign ? { "stripe-signature": `t=${t},v1=${sig}` } : {} });
  };
  const checkoutEvent = (id, paymentId, amount) => ({ id, type: "checkout.session.completed", data: { object: { id: `cs_${paymentId}`, payment_status: "paid", amount_total: amount, currency: "usd", metadata: { paymentId } } } });
  await db.payment.create({ data: { id: "pay-e2e-1", userId: user.id, platformSlug: "acca", description: "ACCA — full access", amountCents: 14900, currency: "USD", status: "PENDING", provider: "stripe", providerPaymentId: "cs_pay-e2e-1", checkoutUrl: "https://checkout.stripe.com/x" } });
  const access = async () => (await db.enrollment.findUnique({ where: { userId_platformSlug: { userId: user.id, platformSlug: "acca" } } }));

  await step("webhook: unsigned / wrong-signature / stale requests are rejected and nothing is granted", async () => {
    assert((await post(checkoutEvent("evt_a", "pay-e2e-1", 14900), { sign: false })).status === 400, "unsigned");
    assert((await post(checkoutEvent("evt_a", "pay-e2e-1", 14900), { stale: true })).status === 400, "stale timestamp");
    assert((await fetch(`${BASE}/api/webhooks/payments`, { method: "POST", body: "{}", headers: { "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` } })).status === 400, "bad signature");
    assert(!(await access()) && (await db.payment.findUnique({ where: { id: "pay-e2e-1" } })).status === "PENDING", "state changed by a rejected request");
  });
  await step("webhook: a wrong amount is ignored (no access); the correct signed event grants access exactly once; replays are harmless", async () => {
    const bad = await post(checkoutEvent("evt_bad", "pay-e2e-1", 100)); assert(bad.status === 200 && (await bad.json()).outcome === "ignored", "mismatch outcome");
    assert(!(await access()), "access granted for a wrong amount");
    const ok = await post(checkoutEvent("evt_ok", "pay-e2e-1", 14900)); assert((await ok.json()).outcome === "applied", "applied");
    const e = await access(); assert(e?.status === "ACTIVE" && e.source === "payment" && e.paymentId === "pay-e2e-1", `enrollment ${JSON.stringify(e)}`);
    assert((await db.payment.findUnique({ where: { id: "pay-e2e-1" } })).status === "PAID", "payment status");
    assert((await (await post(checkoutEvent("evt_ok", "pay-e2e-1", 14900))).json()).outcome === "duplicate", "replay");
    assert((await (await post(checkoutEvent("evt_ok2", "pay-e2e-1", 14900))).json()).outcome === "ignored", "second paid event");
    assert((await db.notification.count({ where: { userId: user.id, code: "payment_received" } })) === 1, "one notification");
    const mail = await lastMail("Payment received"); assert(mail.includes("$149.00"), "confirmation mail with amount");
    await studentPage.goto("/platform/acca"); await studentPage.waitForLoadState("networkidle"); assert((await studentPage.getByText(/Enroll to access/).count()) === 0, "platform still gated after payment");
  });
  await step("webhook: a full refund withdraws the access that payment granted", async () => {
    const ref = { id: "evt_ref", type: "charge.refunded", data: { object: { amount: 14900, amount_refunded: 14900, metadata: { paymentId: "pay-e2e-1" } } } };
    assert((await (await post(ref)).json()).outcome === "applied", "refund applied"); assert((await access())?.status === "REVOKED", "enrollment not revoked");
    await studentPage.goto("/platform/acca"); await studentPage.getByText(/Enroll to access/).waitFor();
  });

  // ── full purchase through the Stripe REST adapter (against the local test double) and the signed webhook
  await db.platform.update({ where: { slug: "fia" }, data: { priceCents: 2900 } });
  const fiaAccess = async () => db.enrollment.findUnique({ where: { userId_platformSlug: { userId: user.id, platformSlug: "fia" } } });
  const paymentsOf = async () => db.payment.findMany({ where: { userId: user.id, platformSlug: "fia" }, orderBy: { createdAt: "asc" } });
  const evt = (type, paymentId, object = {}) => ({ id: `evt_${type}_${Math.random().toString(36).slice(2, 9)}`, type, data: { object: { id: `cs_for_${paymentId}`, metadata: { paymentId }, ...object } } });
  const sessionPaid = (paymentId, o = {}) => evt("checkout.session.completed", paymentId, { payment_status: "paid", amount_total: 2900, currency: "usd", ...o });
  const outcome = async (e, opts) => { const r = await post(e, opts); return r.status === 200 ? (await r.json()).outcome : `http ${r.status}`; };
  let p1;

  await step("checkout (Stripe adapter vs test double): one session per purchase attempt, price from the database, double click reuses it, nothing is unlocked", async () => {
    await studentPage.goto("/platform/fia"); const buy = studentPage.getByRole("button", { name: /Buy access — \$29\.00/ });
    await buy.click(); await studentPage.waitForURL(/127\.0\.0\.1:12111\/pay\//); await studentPage.getByText(/not Stripe/).waitFor();
    assert(stripeCalls.length === 1, `stripe calls ${stripeCalls.length}`);
    const c = stripeCalls[0]; assert(c.auth === "Bearer sk_test_x", "bearer key"); const [pay] = await paymentsOf(); p1 = pay;
    assert(pay.status === "PENDING" && pay.amountCents === 2900 && pay.currency === "USD" && pay.provider === "stripe" && pay.providerPaymentId === "cs_test_1", `payment ${JSON.stringify(pay)}`);
    assert(c.idem === pay.id, "Idempotency-Key is the payment id"); assert(c.params["line_items[0][price_data][unit_amount]"] === "2900" && c.params["line_items[0][price_data][currency]"] === "usd", "amount / currency sent to Stripe");
    assert(c.params["metadata[paymentId]"] === pay.id && c.params.client_reference_id === pay.id && c.params.customer_email === studentEmail, "metadata / reference / customer");
    assert(c.params.success_url.startsWith("https://acca.example/payments?paid=") && c.params.cancel_url.startsWith("https://acca.example/payments?cancelled="), "return URLs use APP_URL");
    assert(!JSON.stringify(c.params).includes("sk_test"), "secret key inside the request body");
    // second click (another tab / double click) → the same open checkout, no second Stripe session
    await studentPage.goto("/platform/fia"); await studentPage.getByRole("button", { name: /Buy access/ }).click(); await studentPage.waitForURL(/127\.0\.0\.1:12111\/pay\//);
    assert(stripeCalls.length === 1 && (await paymentsOf()).length === 1, "a second checkout was created");
    assert(!(await fiaAccess()), "access before the webhook");
    // returning from the checkout proves nothing
    await studentPage.goto(`/payments?paid=${p1.id}`); await studentPage.getByText(/waiting|confirm/i).first().waitFor(); await studentPage.goto("/platform/fia"); await studentPage.getByText(/Enroll to access/).waitFor();
  });
  await step("webhook edge cases: wrong currency, missing amount, unpaid session, unknown payment — all ignored, nothing unlocked", async () => {
    assert((await outcome(sessionPaid(p1.id, { currency: "eur" }))) === "ignored", "wrong currency");
    assert((await outcome(sessionPaid(p1.id, { amount_total: undefined }))) === "ignored", "missing amount");
    assert((await outcome(sessionPaid(p1.id, { currency: undefined }))) === "ignored", "missing currency");
    assert((await outcome(sessionPaid(p1.id, { payment_status: "unpaid" }))) === "ignored", "completed but unpaid");
    assert((await outcome(sessionPaid("pay-does-not-exist"))) === "ignored", "unknown payment");
    assert((await outcome(evt("customer.created", p1.id))) === "ignored", "unrelated event type");
    assert(!(await fiaAccess()) && (await db.payment.findUnique({ where: { id: p1.id } })).status === "PENDING", "state changed by an invalid event");
  });
  await step("webhook: the correct event is applied exactly once even when delivered 6 times in parallel; a partial refund keeps access", async () => {
    const paid = sessionPaid(p1.id);
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => outcome(paid)));
    assert(outcomes.filter((o) => o === "applied").length === 1 && outcomes.filter((o) => o === "duplicate").length === 5, `outcomes ${outcomes}`);
    const e = await fiaAccess(); assert(e?.status === "ACTIVE" && e.source === "payment" && e.paymentId === p1.id, "enrollment");
    assert((await db.notification.count({ where: { userId: user.id, code: "payment_received" } })) === 2, "one new notification only");
    await studentPage.goto("/platform/fia"); await studentPage.waitForLoadState("networkidle"); assert((await studentPage.getByText(/Enroll to access/).count()) === 0, "platform gated after payment");
    assert((await outcome(evt("charge.refunded", p1.id, { amount: 2900, amount_refunded: 1000 }))) === "ignored", "partial refund");
    assert((await fiaAccess())?.status === "ACTIVE", "a partial refund must not revoke access");
  });
  await step("webhook: a full refund → REFUNDED and access REVOKED; later paid / refund events change nothing; the learner can buy again", async () => {
    assert((await outcome(evt("charge.refunded", p1.id, { amount: 2900, amount_refunded: 2900 }))) === "applied", "refund");
    assert((await db.payment.findUnique({ where: { id: p1.id } })).status === "REFUNDED" && (await fiaAccess())?.status === "REVOKED", "refund state");
    assert((await outcome(sessionPaid(p1.id))) === "ignored", "paid after refund"); assert((await outcome(evt("charge.refunded", p1.id, { amount: 2900, amount_refunded: 2900 }))) === "ignored", "second refund");
    assert((await fiaAccess())?.status === "REVOKED", "re-granted by a late event");
    await studentPage.goto("/platform/fia"); await studentPage.getByRole("button", { name: /Buy access/ }).click(); await studentPage.waitForURL(/127\.0\.0\.1:12111\/pay\//);
    const all = await paymentsOf(); assert(all.length === 2 && all[1].status === "PENDING" && stripeCalls.length === 2, `second purchase: ${all.length} payments, ${stripeCalls.length} stripe calls`);
  });
  await step("expired / failed checkouts: CANCELLED / FAILED notify nothing false; a cancelled checkout cannot be paid later", async () => {
    const p2 = (await paymentsOf())[1];
    assert((await outcome(evt("checkout.session.expired", p2.id))) === "applied", "expired"); assert((await db.payment.findUnique({ where: { id: p2.id } })).status === "CANCELLED", "cancelled");
    assert((await outcome(sessionPaid(p2.id, { id: "cs_test_2" }))) === "ignored", "paid after cancel"); assert((await fiaAccess())?.status === "REVOKED", "access after a cancelled checkout");
    await studentPage.goto("/platform/fia"); await studentPage.getByRole("button", { name: /Buy access/ }).click(); await studentPage.waitForURL(/127\.0\.0\.1:12111\/pay\//);
    const p3 = (await paymentsOf())[2]; assert(p3 && p3.status === "PENDING", "third purchase");
    assert((await outcome(evt("checkout.session.async_payment_failed", p3.id))) === "applied", "failed"); assert((await db.payment.findUnique({ where: { id: p3.id } })).status === "FAILED", "failed state");
    const mail = await lastMail("could not be completed").catch(() => ""); assert(!mail || !/Payment received/.test(mail), "a failed payment produced a success mail");
    assert((await db.payment.count({ where: { userId: user.id, status: "PAID" } })) === 0 && (await db.payment.count({ where: { userId: user.id, status: "REFUNDED" } })) === 2, "ledger: two refunded payments keep their history, none is PAID");
  });
  await step("payments admin: ledger shows the real payments with provider and mode badge (TEST), filters work, no secrets, no manual paid action", async () => {
    const { c, p } = await adminLogin();
    await p.goto("/admin/payments"); await p.locator("[data-payment-mode='test']").waitFor(); const html = await p.content();
    assert(!/sk_test|whsec_|PAYMENT_SECRET|cs_test_1/.test(html), "a secret or a provider session id is rendered");
    assert((await p.getByRole("row").count()) >= 5, "ledger rows"); assert(/Refunded/.test(await p.locator("main").innerText()), "refunded payment missing");
    assert((await p.getByRole("button", { name: /mark as paid|set paid|simulate/i }).count()) === 0, "a manual paid control exists");
    await c.close();
  });

  // ── e-mail: real test message, counters, outage handling, no secrets
  await step("e-mail: Admin → Settings sends ONE real test message to the admin's own address over SMTP; status shows SMTP host/sender but never the credentials", async () => {
    const { c, p } = await adminLogin(); await p.goto("/admin/settings"); await p.locator("[data-email-status='smtp']").waitFor();
    const status = await p.locator("[data-email-card]").innerText(); assert(status.includes("127.0.0.1:2525") && status.includes("no-reply@acca.example"), `status: ${status}`);
    assert(!status.includes("smtp-secret-pw-8231") && !status.includes("smtp-user-77"), "SMTP credentials rendered");
    await p.getByRole("button", { name: "Send a test e-mail to my address" }).click(); await p.locator("[data-testmail-result='success']").waitFor();
    const mail = await lastMail("Test message from ACCA USA"); assert(/To: .*owner@acca\.example/i.test(mail) || mail.includes("owner@acca.example"), "test mail not addressed to the admin");
    assert(!(await p.content()).includes("smtp-secret-pw-8231"), "password in the page"); await c.close();
  });
  await step("e-mail: the test button is rate-limited and cannot be used by a student or a guest", async () => {
    const { c, p } = await adminLogin(); await p.goto("/admin/settings");
    for (let i = 0; i < 5; i++) { await p.getByRole("button", { name: "Send a test e-mail to my address" }).click(); await p.locator("[data-testmail-result]").first().waitFor(); }
    await p.getByText("Too many test messages. Try again later.").waitFor(); await c.close();
    await studentPage.goto("/admin/settings"); assert(!/admin/.test(new URL(studentPage.url()).pathname), "student reached settings");
  });
  await step("e-mail outage: with the SMTP server down registration still succeeds, the failure is logged as a CODE only, credentials never appear in logs, counters show it", async () => {
    await new Promise((r) => sink.close(r)); // nobody listens on the SMTP port any more
    const c = await ctx(); const p = await c.newPage(); await p.goto("/register"); await p.locator("#reg-name").fill("Outage Learner"); await p.locator("#reg-email").fill(`outage.${Date.now()}@example.com`);
    await p.locator("#reg-password").fill("Learner-pass123"); await p.locator("#reg-confirm").fill("Learner-pass123"); await p.locator("#reg-terms").click(); await p.locator("#reg-privacy").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard$/); await c.close();
    const failedRe = /"event":"email\.send_failed","provider":"smtp","failure":"CONNECTION"/;
    for (let i = 0; i < 40 && !failedRe.test(server.output()); i++) await sleep(250); // the welcome mail is sent after the response
    const log = server.output(); assert(failedRe.test(log), `no classified failure in the log: ${log.slice(-400)}`);
    assert(!log.includes("smtp-secret-pw-8231") && !log.includes("smtp-user-77"), "SMTP credentials in the server log");
    const { c: c2, p: p2 } = await adminLogin(); await p2.goto("/admin/settings"); const counters = await p2.locator("[data-email-counters]").innerText();
    assert(/Failed: [1-9]/.test(counters) && /cannot connect to the mail server/.test(counters), `counters: ${counters}`); await c2.close();
  });
  await step("legal: pages name the configured operator, consent evidence is stored per account, and an outdated version asks for acceptance again", async () => {
    const c0 = await ctx(); const p0 = await c0.newPage(); await p0.goto("/privacy"); const txt = await p0.locator("[data-legal-document]").innerText();
    for (const v of ["Acca Test LLC", "1 Test Street, Tashkent", "123456789", "privacy@acca.example", "Test datacentre, Tashkent"]) assert(txt.includes(v), `legal page misses the configured value ${v}`);
    assert(!txt.includes("not configured by the operator"), "unconfigured marker shown although everything is configured");
    await p0.goto("/refunds"); assert((await p0.locator("[data-legal-document]").innerText()).includes("14 days"), "refund window not rendered"); await p0.goto("/terms"); assert((await p0.locator("[data-legal-document]").innerText()).includes("Test law"), "governing law not rendered"); await c0.close();
    const mail = `consent.${Date.now()}@example.com`;
    const c = await ctx(); const p = await c.newPage(); await p.goto("/register"); await p.locator("#reg-name").fill("Consent Learner"); await p.locator("#reg-email").fill(mail);
    await p.locator("#reg-password").fill("Learner-pass123"); await p.locator("#reg-confirm").fill("Learner-pass123"); await p.locator("#reg-terms").click(); await p.locator("#reg-privacy").click(); await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard$/); await c.close();
    const u = await db.user.findUnique({ where: { email: mail } }); const rows = await db.consentRecord.findMany({ where: { userId: u.id } });
    assert(rows.length === 2 && rows.every((r) => r.granted && r.version === "2026-10-12" && r.source === "register" && r.locale === "en"), `consent evidence: ${JSON.stringify(rows)}`);
    const admin = await db.user.findUnique({ where: { email: "owner@acca.example" } }); assert((await db.consentRecord.count({ where: { userId: admin.id, source: "reconsent" } })) >= 2, "the CLI-created administrator was not asked to accept");
    await db.consentRecord.updateMany({ where: { userId: u.id }, data: { version: "2020-01-01" } }); // as if the text had changed since they accepted
    const c2 = await ctx(); const p2 = await c2.newPage(); await p2.goto("/login"); await p2.locator("#login-email").fill(mail); await p2.locator("#login-password").fill("Learner-pass123"); await p2.getByRole("button", { name: "Sign in", exact: true }).click(); await p2.waitForURL(/\/consent/);
    assert((await (await c2.request.get("/courses", { maxRedirects: 0 })).headers().location ?? "").includes("/consent"), "outdated consent did not close the site");
    await p2.locator("#consent-terms").click(); await p2.locator("#consent-privacy").click(); await p2.getByRole("button", { name: "Accept and continue" }).click(); await p2.waitForURL(/dashboard$/);
    const after = await db.consentRecord.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } }); assert(after.length === 4 && after.slice(2).every((r) => r.version === "2026-10-12" && r.source === "reconsent"), "re-acceptance not recorded as new history"); await c2.close();
  });
  await step("audit log: operator CLIs, sign-ins, MFA, e-mail test and payment events are recorded without secrets; the chain verifies; the database refuses rewrites; tampering is detected", async () => {
    const events = await db.auditEvent.findMany({ orderBy: { seq: "asc" } }); const actions = new Set(events.map((e) => e.action));
    for (const a of ["admin.created", "admin.password_reset", "mfa.reset", "mfa.enabled", "auth.login", "email.test_sent", "payment.paid", "payment.refunded"]) assert(actions.has(a), `audit event missing: ${a} (have ${[...actions].join(", ")})`);
    assert(events.find((e) => e.action === "payment.refunded").actorType === "system", "payment events are attributed to the system, not a person");
    assert(events.find((e) => e.action === "mfa.reset").actorType === "cli", "operator CLI actions are attributed to the operator");
    const blob = JSON.stringify(events);
    for (const secret of ["Owner-pass", "smtp-secret-pw-8231", "smtp-user-77", mfaSecret, ...mfaRecovery, baseEnv.AUTH_SECRET]) assert(!blob.includes(secret), `a secret reached the audit log: ${secret.slice(0, 6)}…`);
    const verify = () => spawnSync("npx", ["tsx", "scripts/audit-verify.ts"], { env: { ...process.env, DATABASE_URL: DB_URL, AUTH_SECRET: baseEnv.AUTH_SECRET }, encoding: "utf8" });
    let v = verify(); assert(v.status === 0 && /intact: \d+ events/.test(v.stdout), `verify: ${v.stdout}${v.stderr}`);
    const noKey = spawnSync("npx", ["tsx", "scripts/audit-verify.ts"], { env: { ...process.env, DATABASE_URL: DB_URL, AUTH_SECRET: "", AUDIT_CHAIN_SECRET: "" }, encoding: "utf8" }); assert(noKey.status === 1, "verification without the key must refuse, not pass");
    const wrongKey = spawnSync("npx", ["tsx", "scripts/audit-verify.ts"], { env: { ...process.env, DATABASE_URL: DB_URL, AUTH_SECRET: "x".repeat(48) }, encoding: "utf8" }); assert(wrongKey.status === 2, "a different key must not validate the chain");
    const first = events[0];
    let rejected = false; try { await db.auditEvent.update({ where: { id: first.id }, data: { action: "x.y" } }); } catch (e) { rejected = /append-only/.test(String(e)); } assert(rejected, "UPDATE on the audit log was not rejected by the database");
    rejected = false; try { await db.auditEvent.deleteMany({}); } catch (e) { rejected = /append-only/.test(String(e)); } assert(rejected, "DELETE on the audit log was not rejected by the database");
    await db.$transaction([db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER USER`), db.$executeRawUnsafe(`UPDATE "AuditEvent" SET "outcome" = 'failed' WHERE "id" = '${first.id}'`), db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER USER`)]);
    v = verify(); assert(v.status === 2 && v.stderr.includes(first.id), `tampering not detected: ${v.stdout}${v.stderr}`);
    await db.$transaction([db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" DISABLE TRIGGER USER`), db.$executeRawUnsafe(`UPDATE "AuditEvent" SET "outcome" = '${first.outcome}' WHERE "id" = '${first.id}'`), db.$executeRawUnsafe(`ALTER TABLE "AuditEvent" ENABLE TRIGGER USER`)]);
    v = verify(); assert(v.status === 0, "chain should be intact after restoring the row");
    const { c, p } = await adminLogin(); await p.goto("/admin/audit"); await p.locator("[data-audit-integrity='ok']").waitFor();
    assert((await p.locator("[data-audit-action='payment.refunded']").count()) >= 1 && (await p.locator("[data-audit-action='mfa.reset']").count()) >= 1, "UI does not list the events"); await c.close();
  });
  await db.$disconnect();
} catch (e) {
  results.push(["setup / fatal", false]); console.log("  FATAL", e.message);
} finally {
  if (browser) await browser.close();
  server?.stop(); sink.close(); fakeStripe.close(); await waitDown();
  try { sh("psql", [ADMIN_URL, "-c", `DROP DATABASE IF EXISTS ${DB}`]); } catch { /* best effort */ }
}
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
