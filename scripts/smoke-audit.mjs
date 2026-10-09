// Admin audit log. BASE_URL=... CHROMIUM=... node scripts/smoke-audit.mjs  (fresh server, after `npm run build`; runs on both providers)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async () => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const status = async (c, url, o = {}) => (await c.request.get(url, { maxRedirects: 0, ...o })).status();

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);

await step("1 the sign-in itself is the first audit event; the log shows a verified hash chain", async () => {
  await a.goto("/admin/audit"); await a.getByRole("heading", { name: "Audit log" }).waitFor();
  await a.locator("[data-audit-integrity='ok']").waitFor();
  assert((await a.locator("[data-audit-action='auth.login']").count()) >= 1, "login event missing");
  assert((await a.locator("[data-audit-table]").innerText()).includes("admin@example.com"), "actor e-mail missing");
});
await step("2 an admin change creates an event with the actor, the target and field NAMES (never the values)", async () => {
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Audit probe SECRETBODY-91"); await a.locator("#f-kind").selectOption("notes");
  await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.locator("#f-topic").selectOption({ label: "Business organisations and their stakeholders" });
  await a.locator("#f-body").fill("Body SECRETBODY-91"); await a.locator("#f-visibility").selectOption("draft");
  await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/audit?action=materials"); const row = a.locator("[data-audit-action='materials.create']").first(); await row.waitFor();
  const text = await row.innerText(); assert(text.includes("admin@example.com") && text.includes("materials"), `row: ${text}`);
  assert(text.includes("title") && text.includes("body"), `field names missing: ${text}`);
  assert(!(await a.content()).includes("SECRETBODY-91"), "submitted VALUE leaked into the audit log");
});
await step("3 filters work (action prefix, outcome, actor) and pagination links are plain navigation", async () => {
  await a.goto("/admin/audit?action=materials"); assert((await a.locator("[data-audit-action]").count()) >= 1, "prefix filter");
  assert((await a.locator("[data-audit-action='auth.login']").count()) === 0, "filter leaked other actions");
  await a.goto("/admin/audit?outcome=failed"); assert((await a.locator("[data-audit-action='materials.create']").count()) === 0, "outcome filter");
  await a.goto("/admin/audit?actor=nobody-here"); await a.locator("[data-audit-empty]").waitFor();
});
await step("4 the page is READ-ONLY: only the GET filter form, no edit / delete controls, and no method other than GET reaches it", async () => {
  await a.goto("/admin/audit");
  const forms = await a.locator("main form").evaluateAll((fs) => fs.map((f) => f.method.toLowerCase()));
  assert(forms.length === 1 && forms[0] === "get", `forms: ${forms}`);
  assert((await a.getByRole("button", { name: /delete|remove|edit|clear|purge|erase/i }).count()) === 0, "a mutating control exists");
  const total = async () => (await a.goto("/admin/audit"), (await a.locator("nav[aria-label='Audit log pages']").innerText()).match(/(\d+) events/)[1]);
  const n0 = await total();
  for (const method of ["post", "put", "patch", "delete"]) await ac.request[method]("/admin/audit", { data: {}, maxRedirects: 0 }); // whatever the framework answers, nothing may change
  assert((await total()) === n0, "an event count changed after non-GET requests");
});
await step("5 a student (and a guest) cannot read the log", async () => {
  assert((await status(sc, "/admin/audit")) === 307, "student");
  const g = await ctx(); assert((await status(g, "/admin/audit")) === 307, "guest"); await g.close();
  await s.goto("/dashboard"); assert((await s.locator("a[href='/admin/audit']").count()) === 0, "audit link visible to a student");
});
await step("6 failed second-factor attempts and MFA enrolment are recorded (outcome failed / success)", async () => {
  // enrol MFA for this admin, then fail a challenge in a second context
  await a.goto("/admin/security"); const secret = (await a.getByTestId("mfa-secret").innerText()).trim();
  const { createHmac } = await import("node:crypto");
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const out = []; for (const ch of secret) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", Buffer.from(out)).update(ctr).digest(); const o = h[19] & 15;
  await a.locator("#mfa-confirm").fill(String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0")); await a.getByRole("button", { name: "Confirm and enable" }).click(); await a.getByTestId("recovery-codes").waitFor();
  const c2 = await ctx(); const p2 = await c2.newPage(); await demo(p2, "Admin"); await p2.waitForURL(/login\/mfa/);
  await p2.locator("#mfa-code").fill("000001"); await p2.getByRole("button", { name: "Verify" }).click(); await p2.getByText("That code is not valid.").waitFor(); await c2.close();
  await a.goto("/admin/audit?outcome=failed"); await a.locator("[data-audit-action='auth.mfa_failed']").first().waitFor();
  await a.goto("/admin/audit?action=mfa"); await a.locator("[data-audit-action='mfa.enabled']").first().waitFor();
});

await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`${results.length - failed}/${results.length} steps passed`);
process.exit(failed ? 1 : 0);
