// Security regression (non-destructive). BASE_URL=... CHROMIUM=... node scripts/smoke-security.mjs  (fresh server, after `npm run build`)
import { chromium } from "playwright-core";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const T1 = "bt-business-organisations-and-their-stakeholders";
const walk = (dir, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const status = async (c, url, o = {}) => (await c.request.get(url, { maxRedirects: 0, ...o })).status();

const gc = await ctx();
await step("1-2 guest: protected material → login redirect; protected files → 401; no file ids in public HTML", async () => {
  assert((await status(gc, `/subject/bt/topic/${T1}/material/${T1}-video`)) === 307, "viewer should redirect");
  for (const id of ["seed-bt-lecture", "seed-bt-overview", "seed-bt-glossary", "seed-ma-workbook"]) assert((await status(gc, `/api/files/${id}`)) === 401, `${id} not 401`);
  for (const path of ["/", "/all-courses", "/subject/bt", "/acca", "/books"]) { const html = await (await gc.request.get(path)).text(); assert(!html.includes("seed-bt-") && !html.includes("/api/files/"), `file reference in ${path}`); }
});

const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);
await step("3 student cannot reach admin pages, admin notifications, uploads or admin-only APIs", async () => {
  for (const path of ["/admin", "/admin/students", "/admin/question-bank", "/admin/tests", "/admin/certificates", "/admin/statistics", "/admin/notifications", "/admin/settings"]) { const st = await status(sc, path); assert(st === 307, `${path} → ${st}`); }
  const up = await sc.request.post("/api/uploads", { multipart: { kind: "image", file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") } } }); assert([401, 403].includes(up.status()), `uploads ${up.status()}`);
});
await step("4 role cannot be changed client-side: forged / unsigned / tampered session cookies are rejected", async () => {
  const cookies = await sc.cookies(); const sess = cookies.find((c) => c.name === "acca_session"); assert(sess, "no session cookie");
  const [payload, sig] = sess.value.split("."); const claims = JSON.parse(Buffer.from(payload, "base64url").toString()); assert(claims.role === "STUDENT", "role claim");
  const forged = Buffer.from(JSON.stringify({ ...claims, role: "ADMIN" })).toString("base64url");
  for (const [label, value] of [["role swapped, old signature", `${forged}.${sig}`], ["no signature", `${forged}.`], ["alg-none style", forged], ["garbage", "x.y.z"]]) {
    const c = await ctx(); await c.addCookies([{ name: "acca_session", value, url: BASE }]); const st = await status(c, "/admin"); assert(st === 307 && (await c.request.get("/admin", { maxRedirects: 0 })).headers().location?.includes("/login"), `${label}: /admin → ${st}`); await c.close();
  }
  const flags = sess; assert(flags.httpOnly && flags.sameSite === "Lax", `cookie flags httpOnly=${flags.httpOnly} sameSite=${flags.sameSite}`);
});
await step("5 correct answers / explanations are NOT in the page, RSC payload or API before submit; they appear only in the review afterwards", async () => {
  await s.goto("/test/bt-stakeholders-test"); await s.getByRole("button", { name: /Start test|Resume test/ }).click(); await s.getByText("Question 1 of 8").waitFor();
  const html = await s.content(); const rsc = await (await sc.request.get("/test/bt-stakeholders-test", { headers: { RSC: "1" } })).text();
  for (const secret of ["correctOptionId", "A stakeholder is anyone with an interest in", "Shareholders own part of the company", "Employees and managers work inside"]) assert(!html.includes(secret) && !rsc.includes(secret), `leaked before submit: ${secret}`);
  await s.getByRole("button", { name: "Submit test" }).first().click(); await s.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await s.waitForURL(/result/);
  await s.locator("#review").getByText(/Explanation/).first().waitFor(); assert((await s.locator("main").innerText()).includes("anyone with an interest"), "review should show explanations after submit");
});
await step("6 results are computed on the server and readable only by their owner (another student / a guest opening the result URL sees nothing)", async () => {
  const resultUrl = s.url().replace(BASE, ""); const oc = await ctx(); const o = await oc.newPage();
  await o.goto("/register"); await o.locator("#reg-name").fill("Sec Tester"); await o.locator("#reg-email").fill(`sec.${Date.now()}@example.com`); await o.locator("#reg-password").fill("Sec-pass123456"); await o.locator("#reg-confirm").fill("Sec-pass123456"); await o.locator("#reg-terms").click(); await o.locator("#reg-privacy").click(); await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  await o.goto("/courses"); await o.getByRole("button", { name: "Enroll (free in demo)" }).first().click(); await o.getByText("Enrolled").first().waitFor();
  await o.goto(resultUrl); assert(!(await o.content()).includes("anyone with an interest"), "another user's review is visible");
  const g = await ctx(); assert((await status(g, resultUrl)) === 307, "guest result"); await g.close(); await oc.close();
});
await step("7-9 files: unknown id 404, not-enrolled 403, invalid Range 416; unknown material is a real 404; other student's certificate 404", async () => {
  assert((await status(sc, "/api/files/does-not-exist")) === 404, "unknown file");
  assert((await status(sc, `/subject/bt/topic/${T1}/material/nope`)) === 404, "unknown material status");
  assert((await status(sc, `/subject/nope/topic/nope/material/nope`)) === 404, "unknown subject chain");
  assert((await status(sc, "/api/files/seed-bt-lecture", { headers: { Range: "bytes=999999999-" } })) === 416, "range");
  const oc = await ctx(); const o = await oc.newPage(); await o.goto("/register"); await o.locator("#reg-name").fill("Sec Two"); await o.locator("#reg-email").fill(`sec2.${Date.now()}@example.com`); await o.locator("#reg-password").fill("Sec-pass123456"); await o.locator("#reg-confirm").fill("Sec-pass123456"); await o.locator("#reg-terms").click(); await o.locator("#reg-privacy").click(); await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  assert((await status(oc, "/api/files/seed-bt-lecture")) === 403, "not-enrolled file access"); assert((await status(oc, `/subject/bt/topic/${T1}/material/${T1}-video`)) === 307, "not-enrolled viewer should redirect to the platform page");
  assert((await o.request.get("/api/certificates/cert-demo-bt/pdf")).status() === 404, "foreign certificate"); await o.goto("/certificates/cert-demo-bt"); assert((await o.locator("[data-certificate]").count()) === 0, "foreign certificate visible"); await oc.close();
});
const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
await step("10 admin-only operations: student sessions cannot call admin actions (every admin action re-checks role + permission server-side)", async () => {
  const src = readFileSync("src/features/admin/actions.ts", "utf8"); const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  assert(exported.length >= 4, "admin actions not found"); for (const name of exported) { const body = src.slice(src.indexOf(`export async function ${name}(`)).split(/\nexport async function /)[0]; assert(/authorize\(/.test(body), `${name} does not call authorize()`); }
  assert(/sessionOrNull\(STAFF_ROLES\)/.test(src), "STAFF_ROLES guard missing");
  const material = readFileSync("src/features/material/actions.ts", "utf8"); assert(/sessionOrNull\(\)/.test(material) && /isEnrolled/.test(material), "material actions must check session + enrolment");
  assert((await a.request.get("/api/uploads", { maxRedirects: 0 })).status() !== 200, "uploads GET");
});
await step("11-13 registration never offers a role; no Teacher / CIMA anywhere in source, schema or UI", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/register"); assert((await p.locator("select, [name=role], [id*=role]").count()) === 0, "role field on registration"); await c.close();
  const reg = readFileSync("src/features/auth/actions.ts", "utf8"); assert(/only ever creates a STUDENT/i.test(reg) || !/role/.test(reg.slice(reg.indexOf("registerAction"))), "registration role handling");
  const files = [...walk("src"), ...walk("prisma"), "package.json", "README.md", "PROJECT_RULES.md"].filter((f) => /\.(ts|tsx|json|prisma|md|css|mjs)$/.test(f) && !f.includes("messages/"));
  for (const f of files) { const t = readFileSync(f, "utf8"); assert(!/teacher/i.test(t.replace(/no teacher role/gi, "")), `Teacher in ${f}`); assert(!/cima/i.test(t), `CIMA in ${f}`); }
  for (const l of ["en", "ru", "uz"]) { const t = readFileSync(`src/i18n/messages/${l}.json`, "utf8"); assert(!/teacher|cima/i.test(t), `Teacher/CIMA in ${l}.json`); }
  const ui = (await (await gc.request.get("/")).text()) + (await (await gc.request.get("/all-courses")).text()) + (await (await gc.request.get("/forums")).text()); assert(!/cima|teacher/i.test(ui), "Teacher/CIMA in rendered UI");
});
await step("14 nothing sensitive in browser storage after login (no passwords / tokens in localStorage, sessionStorage)", async () => {
  const dump = await s.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } })); assert(!/Demo1|password|acca_session|eyJ/i.test(dump), `storage: ${dump.slice(0, 200)}`);
  const cookies = (await sc.cookies()).map((c) => c.name); assert(cookies.includes("acca_session"), "session cookie"); const names = cookies.filter((n) => /pass|pwd|secret/i.test(n)); assert(names.length === 0, "sensitive cookie names");
});
await step("15 no secrets in the client bundle or public pages (signing secret, password hashes, DB URLs)", async () => {
  const secretFile = join(tmpdir(), "acca-usa-demo", "auth-secret"); const secrets = [];
  if (existsSync(secretFile)) { const raw = readFileSync(secretFile); secrets.push(raw.toString("base64"), raw.toString("hex"), raw.toString("base64url")); }
  if (process.env.AUTH_SECRET) secrets.push(process.env.AUTH_SECRET);
  const needles = [...secrets, "s1$cg06V5H7", "s1$9vWD23uR", "DATABASE_URL=", "postgresql://", "AUTH_SECRET", "STORAGE_SECRET"];
  const staticFiles = existsSync(".next/static") ? walk(".next/static").filter((f) => /\.(js|css|html|json)$/.test(f)) : []; assert(staticFiles.length > 10, "no client bundle found — run `npm run build` first");
  for (const f of staticFiles) { const t = readFileSync(f, "utf8"); for (const n of needles) assert(!t.includes(n), `client bundle ${f} contains ${n.slice(0, 12)}…`); }
  for (const path of ["/", "/login", "/all-courses", "/subject/bt"]) { const html = await (await gc.request.get(path)).text(); for (const n of needles) assert(!html.includes(n), `${path} contains ${n.slice(0, 12)}…`); }
  assert(!(await (await sc.request.get("/dashboard")).text()).includes("Demo1"), "demo password on the dashboard");
});
await step("16 no public file URLs for protected content: public/ holds no uploads; materials only via /api/files", async () => {
  const pub = existsSync("public") ? walk("public") : []; for (const f of pub) assert(!/\.(mp4|webm|mp3|wav|pdf|docx|xlsx|pptx|zip)$/i.test(f), `protected-type file in public/: ${f}`);
  const r = await gc.request.get("/uploads/anything"); assert(r.status() === 404, "uploads path should not exist"); const r2 = await gc.request.get("/_next/static/seed-bt-lecture.mp4"); assert(r2.status() === 404, "static path");
});
await step("17 open redirects are blocked and unsafe ?next values fall back to the dashboard; headers hardened", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/login?next=https://evil.example/phish"); await p.getByRole("button", { name: "Student", exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(/dashboard$/); assert(new URL(p.url()).origin === BASE, "left the origin");
  const c2 = await ctx(); const p2 = await c2.newPage(); await p2.goto("/login?next=//evil.example"); await p2.getByRole("button", { name: "Student", exact: true }).click(); await p2.getByRole("button", { name: "Sign in", exact: true }).click(); await p2.waitForURL(/dashboard$/); assert(new URL(p2.url()).origin === BASE, "protocol-relative redirect");
  const h = (await gc.request.get("/")).headers(); assert(h["x-content-type-options"] === "nosniff" && h["x-frame-options"] && h["referrer-policy"] && !h["x-powered-by"], "security headers"); await c.close(); await c2.close();
});
await step("18 hardened headers (CSP frame/base/form, COOP, nosniff) and control-character redirect tricks (/\\t/host, /\\\\host) are neutralised", async () => {
  const h = (await gc.request.get("/login")).headers();
  assert(/frame-ancestors 'self'/.test(h["content-security-policy"] ?? "") && /base-uri 'self'/.test(h["content-security-policy"] ?? "") && /form-action 'self'/.test(h["content-security-policy"] ?? ""), `csp ${h["content-security-policy"]}`);
  assert(!/object-src/.test(h["content-security-policy"] ?? ""), "object-src would break the PDF viewer"); assert(h["cross-origin-opener-policy"] === "same-origin", "coop");
  // Signed-in users visiting /login are redirected to a SAFE `next` (no login attempts → no rate limit involved).
  for (const next of ["/%09/evil.example", "/%5Cevil.example", "/\\evil.example", "/%0d%0a//evil.example", "javascript:alert(1)", "http://evil.example", "//evil.example"]) {
    await s.goto(`/login?next=${next}`); await s.waitForURL(/\/dashboard$/, { timeout: 15000 }); assert(new URL(s.url()).host === new URL(BASE).host, `redirected off-site for next=${next}`);
  }
});
await gc.close(); await sc.close(); await ac.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
