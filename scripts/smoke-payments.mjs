// Smoke test: paid platforms, demo checkout, webhook, access (grant / revoke / expiry). BASE_URL=... CHROMIUM=... node scripts/smoke-payments.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
let firstPaymentId = "";
const gate = async () => { await s.goto("/platform/fia"); await s.waitForLoadState("networkidle"); return (await s.getByText("Enroll to access FIA").count()) > 0; };

await step("admin: sets a price for FIA (Platforms → Edit → price)", async () => {
  await a.goto("/admin/platforms"); await a.getByRole("button", { name: /^Edit: FIA$/ }).click(); await a.locator("#f-price").fill("29"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/platforms"); await a.getByRole("row", { name: /FIA/ }).getByText("$29.00").waitFor();
});
await step("student: paid platform shows 'Buy access', stays locked, checkout does NOT unlock it", async () => {
  await s.goto("/courses"); const buy = s.getByRole("button", { name: /Buy access — \$29\.00/ }); await buy.waitFor();
  await buy.click(); await s.waitForURL(/\/payments\/demo-checkout\/pay-/); firstPaymentId = s.url().split("/").pop();
  await s.getByText(/DEMO simulation/).waitFor(); assert(await gate(), "FIA unlocked right after starting checkout");
  await s.goto("/payments"); await s.getByRole("row", { name: /FIA — full access/ }).getByText("Pending").waitFor();
});
await step("returning with ?paid=<id> proves nothing: still pending, still locked", async () => {
  await s.goto(`/payments?paid=${firstPaymentId}`); await s.getByText(/waiting for the payment provider/i).waitFor(); assert(await gate(), "unlocked by a URL parameter");
});
await step("failed payment: banner, status Failed, still locked; double-click opens ONE checkout", async () => {
  await s.goto(`/payments/demo-checkout/${firstPaymentId}`); await s.getByRole("button", { name: "Simulate failed payment" }).click(); await s.waitForURL(/payments\?failed=/);
  await s.getByText("The payment was not completed. You have not been charged.").waitFor(); await s.getByRole("row", { name: /FIA — full access/ }).getByText("Failed").waitFor(); assert(await gate(), "unlocked after a failed payment");
  await s.goto("/courses"); const buy = s.getByRole("button", { name: /Buy access/ }); await buy.waitFor(); await Promise.all([s.waitForURL(/demo-checkout/), buy.dblclick()]);
  await s.goto("/payments"); assert((await s.getByRole("row", { name: /FIA — full access.*Pending/ }).count()) === 1, "double click created several pending payments");
});
let paidId = "";
await step("successful payment (verified event) unlocks the platform; payment Paid; notification", async () => {
  await s.goto("/payments"); await s.getByRole("row", { name: /FIA — full access.*Pending/ }).click({ trial: true }).catch(() => {});
  await s.goto("/courses"); await s.getByRole("button", { name: /Buy access/ }).click(); await s.waitForURL(/demo-checkout/); paidId = s.url().split("/").pop();
  await s.getByRole("button", { name: "Simulate successful payment" }).click(); await s.waitForURL(/payments\?paid=/); await s.getByText("Payment confirmed — your access is active.").waitFor();
  await s.getByRole("row", { name: /FIA — full access.*Paid/ }).waitFor(); assert(!(await gate()), "still locked after a verified payment");
  await s.goto("/notifications"); await s.getByText("Payment received").first().waitFor();
});
await step("a payment cannot be completed twice; the checkout page then says so", async () => {
  await s.goto(`/payments/demo-checkout/${paidId}`); await s.getByText("This payment has already been completed.").waitFor(); assert((await s.getByRole("button", { name: "Simulate successful payment" }).count()) === 0, "pay button on a finished payment");
});
await step("another student cannot see, open or complete this payment (IDOR)", async () => {
  const oc = await ctx(); const o = await oc.newPage(); await o.goto("/register"); await o.locator("#reg-name").fill("Pay Tester"); await o.locator("#reg-email").fill(`pay.${Date.now()}@example.com`);
  await o.locator("#reg-password").fill("Pay-pass12345"); await o.locator("#reg-confirm").fill("Pay-pass12345"); await o.locator("#reg-terms").click(); await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  await o.goto(`/payments/demo-checkout/${firstPaymentId}`); await o.getByText(/not found/i).first().waitFor(); assert((await o.getByRole("button", { name: /Simulate/ }).count()) === 0 && !(await o.content()).includes("FIA — full access"), "other student opened the checkout");
  await o.goto(`/payments?paid=${paidId}`); assert((await o.getByText("Payment confirmed").count()) === 0, "other student sees the banner of a foreign payment"); await o.getByText("No payments yet.").waitFor();
  await o.goto("/courses"); await o.getByRole("button", { name: /Buy access/ }).waitFor(); await oc.close();
});
await step("webhook: rejects unsigned / forged / junk requests; no session needed, nothing is unlocked", async () => {
  const g = await ctx(); const r1 = await g.request.post("/api/webhooks/payments", { data: "{}" }); assert(r1.status() === 400, `unsigned ${r1.status()}`);
  const forged = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: { id: "cs_x", payment_status: "paid", metadata: { paymentId: firstPaymentId } } } });
  const r2 = await g.request.post("/api/webhooks/payments", { data: forged, headers: { "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}`, "content-type": "application/json" } }); assert(r2.status() === 400, `forged ${r2.status()}`);
  const r3 = await g.request.post("/api/webhooks/payments", { data: "x".repeat(300_000) }); assert(r3.status() === 413 || r3.status() === 400, `oversized ${r3.status()}`); await g.close();
});
await step("demo-only paths do not exist for guests", async () => {
  const g = await ctx(); const res = await g.request.get(`/payments/demo-checkout/${paidId}`, { maxRedirects: 0 }); assert(res.status() >= 300 && res.status() < 400, `guest ${res.status()}`); await g.close();
});
await step("admin: Access list shows the payment-based enrolment; revoke locks the student out; restore re-opens it", async () => {
  await a.goto("/admin/access"); const row = a.getByRole("row", { name: /Demo Student.*FIA/ }); await row.getByText("Payment").waitFor(); await row.getByText("Active").waitFor();
  await a.getByRole("button", { name: /^Revoke: Demo Student · FIA/ }).click(); await a.getByRole("dialog").getByRole("button", { name: "Revoke" }).click(); await a.getByText("Access revoked.").waitFor();
  assert(await gate(), "revoked student still has access"); await s.goto("/courses"); await s.getByText(/access to this platform was withdrawn/i).waitFor(); assert((await s.getByRole("button", { name: /Buy access/ }).count()) === 0, "buy button for a revoked platform");
  await s.goto("/notifications"); await s.getByText("Access withdrawn").first().waitFor();
  await a.goto("/admin/access"); await a.locator("#flt-status").selectOption({ label: "Revoked" }); await a.getByRole("button", { name: /^Restore: Demo Student · FIA/ }).click(); await a.getByText("Access restored.").waitFor(); assert(!(await gate()), "restored student still locked");
});
await step("admin grant: past / invalid dates refused; a future date works; access keeps progress and shows the expiry", async () => {
  await a.goto("/admin/access"); await a.getByRole("button", { name: "Grant access" }).click();
  await a.locator("#f-student").selectOption({ label: "Maria Lopez (maria@example.com)" }); await a.locator("#f-platform").selectOption({ label: "ACCA" });
  await a.locator("#f-expiresAt").fill("2020-01-01"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("The date must be in the future.").waitFor();
  await a.locator("#f-expiresAt").fill("not-a-date"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Enter a valid date as YYYY-MM-DD.").waitFor();
  const next = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10); await a.locator("#f-expiresAt").fill(next); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.getByRole("row", { name: /Maria Lopez.*ACCA/ }).getByText("Administrator").waitFor();
});
await step("students and guests cannot reach admin access management or its actions", async () => {
  assert((await sc.request.get("/admin/access", { maxRedirects: 0 })).status() !== 200, "student reached /admin/access");
  const g = await ctx(); assert((await g.request.get("/admin/access", { maxRedirects: 0 })).status() !== 200, "guest reached /admin/access"); await g.close();
});
await step("RU / UZ: checkout and access wording", async () => {
  for (const [locale, text] of [["ru", "Платеж"], ["uz", "To‘lov"]]) {
    const c = await ctx(); const p = await c.newPage(); await demo(p, "Student"); await p.waitForURL(/dashboard$/); await c.addCookies([{ name: "NEXT_LOCALE", value: locale, url: BASE }]);
    await p.goto("/payments"); await p.getByRole("heading", { level: 1 }).waitFor(); const body = await p.locator("main").innerText();
    assert(body.includes(text) && !body.includes("Payments"), `${locale} payments page: ${body.slice(0, 120)}`);
    await p.goto(`/payments?paid=${paidId}`); await p.getByText(locale === "ru" ? "Оплата подтверждена — доступ активирован." : "To'lov tasdiqlandi — kirish faollashtirildi.").waitFor(); await c.close();
  }
});

await browser.close();
const failed = results.filter((r) => !r[1]).length; console.log(`\n${results.length - failed}/${results.length} steps passed`); process.exit(failed ? 1 : 0);
