// Production-mode end-to-end check (separate bundle, real PostgreSQL, real SMTP wire protocol, signed payment webhooks).
//   npm run build:prod-test && PG_ADMIN_URL=postgresql://postgres@localhost:5433/postgres node scripts/test-production-mode.mjs
// Creates a throw-away database (acca_prod_test_<ts>) and drops it afterwards. Needs: psql, chromium, a local PostgreSQL.
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const ADMIN_URL = process.env.PG_ADMIN_URL ?? "postgresql://postgres@localhost:5433/postgres";
const DB = `acca_prod_test_${Date.now()}`;
const DB_URL = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${DB}$1`) + (ADMIN_URL.includes("?") ? "" : "?schema=public");
const PORT = "3102";
const BASE = `http://localhost:${PORT}`;
const SMTP_PORT = 2525;
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

const baseEnv = {
  NEXT_PUBLIC_APP_MODE: "production", NODE_ENV: "production", PORT,
  AUTH_SECRET: randomBytes(48).toString("base64"), DATA_PROVIDER: "prisma", DATABASE_URL: DB_URL, APP_URL: "https://acca.example",
  S3_BUCKET: "b", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_ENDPOINT: "http://127.0.0.1:9",
  SMTP_HOST: "127.0.0.1", SMTP_PORT: String(SMTP_PORT), SMTP_USER: "u", SMTP_PASSWORD: "p", EMAIL_FROM: "ACCA USA <no-reply@acca.example>",
  PAYMENT_SECRET_KEY: "sk_test_x", PAYMENT_WEBHOOK_SECRET: "whsec_prod_test",
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
  sh("npx", ["tsx", "scripts/create-admin.ts"], { DATABASE_URL: DB_URL, ADMIN_EMAIL: "owner@acca.example", ADMIN_NAME: "Site Owner", ADMIN_PASSWORD: "Owner-pass-12345" });
  await new Promise((r) => sink.listen(SMTP_PORT, "127.0.0.1", r));

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
    await studentPage.locator("#reg-password").fill("Learner-pass123"); await studentPage.locator("#reg-confirm").fill("Learner-pass123"); await studentPage.locator("#reg-terms").click();
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
  await step("admin created with admin:create can sign in; settings / statistics show no demo wording", async () => {
    const c = await ctx(); const p = await c.newPage(); await p.goto("/login"); await p.locator("#login-email").fill("owner@acca.example"); await p.locator("#login-password").fill("Owner-pass-12345"); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(/admin$/);
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
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const user = await db.user.findUnique({ where: { email: studentEmail } });
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
  await db.$disconnect();
} catch (e) {
  results.push(["setup / fatal", false]); console.log("  FATAL", e.message);
} finally {
  if (browser) await browser.close();
  server?.stop(); sink.close(); await waitDown();
  try { sh("psql", [ADMIN_URL, "-c", `DROP DATABASE IF EXISTS ${DB}`]); } catch { /* best effort */ }
}
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
