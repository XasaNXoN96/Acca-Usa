// Smoke test: certificates. BASE_URL=... CHROMIUM=... node scripts/smoke-certificates.mjs  (fresh server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (n, f) => { try { await f(); results.push([n, true]); console.log("  ok  ", n); } catch (e) { results.push([n, false]); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, process.env.VERBOSE ? 10 : 1).join("\n      ")); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const TAG = String(Date.now()).slice(-5);
let verifyHref = "";

const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
const sc = await ctx(); const s = await sc.newPage(); await demo(s, "Student"); await s.waitForURL(/dashboard$/);

await step("student: certificates page lists the earned certificate and progress towards the next ones", async () => {
  await s.goto("/certificates"); const earned = s.locator("[data-certificate-card=earned]"); await earned.first().waitFor();
  await earned.first().getByText(/ACCA BT — Business and Technology/).waitFor(); await earned.first().getByText(/AU-\d{4}-\d{6}/).waitFor();
  assert((await s.locator("[data-certificate-card=in_progress]").count()) >= 1, "no progress cards"); assert(!/arrives with the backend/i.test(await s.locator("main").innerText()), "stale 'coming soon' text");
});
let certUrl = "";
await step("certificate page: name, course, platform, issue date, number, disclaimer, no legal claims; print button", async () => {
  await s.locator("[data-certificate-card=earned]").first().getByRole("link", { name: "View certificate" }).click(); await s.waitForURL(/\/certificates\/cert-demo-bt$/); certUrl = s.url().replace(BASE, "");
  const doc = s.locator("[data-certificate]"); await doc.waitFor();
  await doc.locator("[data-cert-student]").getByText("Demo Student").waitFor(); await doc.locator("[data-cert-course]").getByText("BT — Business and Technology").waitFor(); await doc.getByText("ACCA", { exact: true }).first().waitFor();
  assert(/AU-\d{4}-000001/.test(await doc.locator("[data-cert-number]").innerText()), "number"); await doc.locator("[data-cert-date]").waitFor();
  const text = await doc.innerText(); assert(/not an ACCA or other awarding-body qualification/.test(text) && /independent learning platform/.test(text), "disclaimer");
  assert(!/accredited|officially recognised|legally/i.test(text), "legal claim in certificate"); await s.getByRole("button", { name: "Print / Save as PDF" }).waitFor();
});
await step("print: only the certificate is visible in print media and a PDF can be produced", async () => {
  await s.emulateMedia({ media: "print" }); const vis = await s.evaluate(() => ({ cert: getComputedStyle(document.querySelector("#certificate-print")).visibility, nav: getComputedStyle(document.querySelector("nav")).visibility }));
  assert(vis.cert === "visible" && vis.nav === "hidden", `print visibility ${JSON.stringify(vis)}`);
  const pdf = await s.pdf({ landscape: true, printBackground: true }); assert(pdf.slice(0, 5).toString() === "%PDF-" && pdf.length > 3000, "pdf output"); await s.emulateMedia({ media: "screen" });
});
await step("page actions: Download PDF + Print + public verification link; verification page shows minimal data only", async () => {
  await s.goto(certUrl); await s.getByRole("link", { name: "Download PDF" }).waitFor(); await s.getByRole("button", { name: "Print / Save as PDF" }).waitFor();
  const href = await s.getByRole("link", { name: "Public verification page" }).getAttribute("href"); assert(/^\/verify\/certificate\/AU-\d{4}-000001$/.test(href ?? ""), `verify href ${href}`);
  verifyHref = href ?? "";
  const g = await ctx(); const v = await g.newPage(); const res = await v.goto(href); assert(res.status() === 200, `verify status ${res.status()}`);
  await v.locator("[data-verify-status=issued]").waitFor(); const txt = await v.locator("main").innerText();
  assert(/Valid certificate/.test(txt) && /Demo S\./.test(txt) && /BT — Business and Technology/.test(txt) && /AU-\d{4}-000001/.test(txt), `verify content: ${txt.slice(0, 200)}`);
  assert(!/Demo Student|@|u-demo|cert-demo|password/i.test(await v.content().then((c) => c.replace(/<script[\s\S]*?<\/script>/g, ""))), "verification page leaks private data");
  const nf = await g.newPage(); assert((await nf.goto("/verify/certificate/AU-2026-999999")).status() === 200, "unknown number page"); await nf.getByText("No certificate with this number was found.").waitFor();
  await nf.goto("/verify/certificate/not-a-number"); await nf.getByText("No certificate with this number was found.").waitFor();
  await g.close();
});
await step("access: owner and admin only — other students 404, guests redirected, owner downloads a real server-generated PDF", async () => {
  const oc = await ctx(); const o = await oc.newPage(); await o.goto("/register"); await o.locator("#reg-name").fill("Cert Tester"); await o.locator("#reg-email").fill(`cert.${Date.now()}@example.com`);
  await o.locator("#reg-password").fill("Cert-pass12345"); await o.locator("#reg-confirm").fill("Cert-pass12345"); await o.locator("#reg-terms").click(); await o.getByRole("button", { name: "Create account" }).click(); await o.waitForURL(/dashboard$/);
  await o.goto(certUrl); assert(!(await o.content()).includes("AU-") || (await o.locator("[data-certificate]").count()) === 0, "another student sees the certificate");
  assert((await oc.request.get("/api/certificates/cert-demo-bt/pdf")).status() === 404, "pdf of another student's certificate");
  const g = await ctx(); assert((await g.request.get(certUrl, { maxRedirects: 0 })).status() >= 300, "guest not redirected"); assert((await g.request.get("/api/certificates/cert-demo-bt/pdf")).status() === 401, "guest pdf"); await g.close();
  const own = await sc.request.get("/api/certificates/cert-demo-bt/pdf"); assert(own.status() === 200, `owner pdf ${own.status()}`);
  const ownBytes = await own.body(); assert(own.headers()["content-type"] === "application/pdf" && ownBytes.slice(0, 5).toString() === "%PDF-" && ownBytes.length > 5000, "owner pdf is a PDF");
  assert(/attachment; filename="AU-\d{4}-000001\.pdf"/.test(own.headers()["content-disposition"] ?? ""), "pdf file name is the certificate number");
  assert(((await (await a.request.get("/api/certificates/cert-demo-bt/pdf")).body()).slice(0, 5).toString()) === "%PDF-", "admin may download any certificate");
  await a.goto(certUrl); await a.locator("[data-certificate]").waitFor(); // admin may open any certificate
  await oc.close();
});

// ---- automatic issue: complete a brand-new one-topic subject ----
const SUB = `Smoke Cert ${TAG}`; const CODE = `S${TAG}`.slice(0, 6);
await step("auto-issue: finishing every topic of a subject issues exactly one certificate (+ notification)", async () => {
  await a.goto("/admin/subjects"); await a.getByRole("button", { name: "Add subject" }).click(); await a.locator("#f-code").fill(CODE); await a.locator("#f-name").fill(SUB); await a.locator("#f-level").selectOption({ label: "ACCA — Applied Knowledge" }); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/topics"); await a.getByRole("button", { name: "Add topic" }).click(); await a.locator("#f-title").fill(`Only topic ${TAG}`); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-durationMinutes").fill("10"); await a.locator("#f-lessonCount").fill("1"); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click(); await a.locator("#f-title").fill(`Only notes ${TAG}`); await a.locator("#f-kind").selectOption("notes"); await a.locator("#f-subject").selectOption({ label: `${CODE} — ${SUB}` }); await a.locator("#f-topic").selectOption({ label: `Only topic ${TAG}` }); await a.locator("#f-body").fill("Notes for the certificate smoke test subject."); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  // a fresh student enrolls and completes it
  const fc = await ctx(); const f = await fc.newPage(); f.on("pageerror", (e) => console.log("      PAGEERROR", String(e).slice(0, 200))); await f.goto("/register"); await f.locator("#reg-name").fill("Auto Cert"); await f.locator("#reg-email").fill(`auto.${Date.now()}@example.com`); await f.locator("#reg-password").fill("Auto-pass12345"); await f.locator("#reg-confirm").fill("Auto-pass12345"); await f.locator("#reg-terms").click(); await f.getByRole("button", { name: "Create account" }).click(); await f.waitForURL(/dashboard$/);
  await f.goto("/courses"); await f.getByRole("button", { name: "Enroll (free in demo)" }).first().click(); await f.getByText("Enrolled").first().waitFor();
  try {
  await f.goto(`/subject/${CODE.toLowerCase()}`); await f.getByRole("link", { name: new RegExp(`Only topic ${TAG}`) }).click(); await f.getByRole("link", { name: new RegExp(`Only notes ${TAG}`) }).first().click();
  await f.getByRole("button", { name: "Mark as completed" }).click(); await f.getByRole("button", { name: "Completed" }).waitFor(); await f.waitForLoadState("networkidle"); // the action finishes issuing the certificate after the optimistic state
  await f.goto("/certificates"); const card = f.locator("[data-certificate-card=earned]");
  await card.getByText(new RegExp(`${CODE} — ${SUB}`)).waitFor(); assert((await card.count()) === 1, "exactly one certificate");
  await f.goto(`/subject/${CODE.toLowerCase()}`); await f.goto(`/subject/${CODE.toLowerCase()}/topic/${await f.evaluate(() => "")}`).catch(() => {});
  await f.goto("/notifications"); await f.getByText(/certificate/i).first().waitFor();
  await f.goto("/certificates"); assert((await f.locator("[data-certificate-card=earned]").count()) === 1, "duplicate after revisit");
  } catch (e) { console.log("      DEBUG url:", f.url()); for (const path of ["/certificates", `/subject/${CODE.toLowerCase()}`, "/notifications"]) { await f.goto(path); console.log("      DEBUG", path, (await f.locator("main").innerText()).replace(/\n+/g, " | ").slice(0, 400)); } throw e; }
  await fc.close();
});
await step("admin: list, search, filters, preview; issue (demo), duplicate refused, not-enrolled refused", async () => {
  await a.goto("/admin/certificates"); await a.getByRole("cell", { name: /AU-\d{4}-000001/ }).first().waitFor(); await a.getByRole("cell", { name: `${CODE} — ${SUB}` }).first().waitFor();
  await a.locator("#admin-search").fill("Demo Student"); await a.getByRole("cell", { name: /AU-\d{4}-000001/ }).first().waitFor(); await a.locator("#admin-search").fill(CODE); await a.getByRole("cell", { name: "Auto Cert" }).first().waitFor(); await a.locator("#admin-search").fill("");
  await a.locator("#flt-platform").selectOption({ label: "FIA" }); await a.getByText("No records match your search.").waitFor(); await a.locator("#flt-platform").selectOption({ label: "ACCA" });
  await a.getByRole("button", { name: /^Preview: AU-\d{4}-000001/ }).first().click(); const d = a.getByRole("dialog"); await d.locator("[data-certificate]").waitFor(); await d.getByText("Issued by an administrator (demo)").waitFor(); await a.keyboard.press("Escape");
  await a.getByRole("button", { name: "Issue certificate" }).click(); await a.locator("#f-student").selectOption({ label: "Demo Student (student@example.com)" }); await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" }); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("This student already has an active certificate for this subject.").first().waitFor();
  await a.locator("#f-subject").selectOption({ label: "FA — Financial Accounting" }); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor(); await a.getByRole("cell", { name: /FA — Financial Accounting/ }).first().waitFor();
  await a.getByRole("button", { name: "Issue certificate" }).click(); await a.locator("#f-student").selectOption({ label: "Aziza Karimova (aziza@example.com)" }); await a.locator("#f-subject").selectOption({ label: "FA — Financial Accounting" }); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("The student is not enrolled in this subject’s platform.").first().waitFor(); await a.keyboard.press("Escape");
});
await step("revoke → student sees Revoked (no print, PDF route 410); restore → valid again", async () => {
  await a.goto("/admin/certificates"); await a.getByRole("button", { name: /^Revoke: AU-\d{4}-000001/ }).first().click(); await a.getByRole("dialog").getByText("Revoke this certificate?").waitFor(); await a.getByRole("dialog").getByRole("button", { name: "Revoke" }).click(); await a.getByText("Certificate revoked.").waitFor();
  await s.goto("/certificates"); await s.locator("[data-certificate-card=revoked]").waitFor(); await s.goto(certUrl); await s.getByText("This certificate has been revoked").waitFor(); assert((await s.getByRole("button", { name: "Print / Save as PDF" }).count()) === 0, "print offered for a revoked certificate");
  assert((await sc.request.get("/api/certificates/cert-demo-bt/pdf")).status() === 410, "pdf of a revoked certificate");
  { const g = await ctx(); const v = await g.newPage(); await v.goto(verifyHref); await v.locator("[data-verify-status=revoked]").waitFor(); assert(/revoked/i.test(await v.locator("main").innerText()), "verification page shows revoked"); await g.close(); }
  await a.locator("#flt-status").selectOption({ label: "Revoked" }); await a.getByRole("button", { name: /^Restore: AU-\d{4}-000001/ }).first().click(); await a.getByText("Certificate restored.").waitFor();
  await s.goto(certUrl); await s.getByRole("button", { name: "Print / Save as PDF" }).waitFor();
});
await step("mobile 360/390: certificate page and admin list fit; certificate text is not clipped", async () => {
  for (const w of [360, 390]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await sc.storageState() }); const p = await c.newPage(); await p.goto(certUrl); await p.locator("[data-certificate]").waitFor(); await p.waitForTimeout(300);
    assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: overflow`); const b = await p.locator("[data-certificate]").boundingBox(); assert(b.x >= 0 && b.x + b.width <= w + 1, `${w}: certificate outside`);
    await c.close();
    const c2 = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: true, storageState: await ac.storageState() }); const q = await c2.newPage(); await q.goto("/admin/certificates"); await q.getByRole("heading", { level: 1 }).waitFor(); assert((await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}: admin overflow`); await c2.close();
  }
});
await step("RU / UZ certificate wording", async () => {
  for (const [loc, marks] of [["ru", ["Сертификат о прохождении курса", "Номер сертификата"]], ["uz", ["Kursni tugatganlik sertifikati", "Sertifikat raqami"]]]) {
    const c = await browser.newContext({ baseURL: BASE, storageState: await sc.storageState() }); await c.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]); const p = await c.newPage(); await p.goto(certUrl);
    for (const m of marks) await p.getByText(m).first().waitFor().catch(() => { throw new Error(`${loc}: "${m}" missing`); }); await c.close();
  }
});
await ac.close(); await sc.close(); await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
