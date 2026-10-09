// PostgreSQL persistence across a SERVER RESTART, and memory-vs-PostgreSQL parity of what a learner / admin sees.
//   DATABASE_URL=<local dev db> node scripts/test-pg-restart.mjs      (needs `npm run build`; resets + seeds that LOCAL db)
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const PORT = "3510", MEM_PORT = "3511";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const results = []; const step = async (n, f) => { try { await f(); results.push(true); console.log("  ok  ", n); } catch (e) { results.push(false); console.log("  FAIL", n, "\n      ", String(e.message).split("\n").slice(0, 60).join("\n      ")); } };
const T1 = "bt-business-organisations-and-their-stakeholders";
const start = (port, env) => { const c = spawn("npx", ["next", "start", "-p", port], { env: { ...process.env, ...env }, stdio: "ignore", detached: true }); return { stop: () => { try { process.kill(-c.pid, "SIGTERM"); } catch { /* gone */ } } }; };
const up = async (port) => { for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://localhost:${port}/login`)).ok) return; } catch { /* wait */ } await sleep(500); } throw new Error(`server ${port} did not start`); };
const down = async (port) => { for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) }); } catch { return; } await sleep(250); } };
const sh = (args) => { const r = spawnSync("npx", ["tsx", ...args], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); };

const browser = await chromium.launch({ executablePath: CHROMIUM });
const login = async (port, who) => { const c = await browser.newContext({ baseURL: `http://localhost:${port}`, viewport: { width: 1280, height: 900 } }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: `http://localhost:${port}` }]); const p = await c.newPage(); await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(who === "Admin" ? /admin$/ : /dashboard$/); return { c, p }; };
let pg;
try {
  sh(["prisma/reset-dev.ts"]); sh(["prisma/seed.ts"]);
  pg = start(PORT, { DATA_PROVIDER: "prisma" }); await up(PORT);
  let state;
  await step("PostgreSQL: progress, material completion, an IN-PROGRESS attempt with autosaved answers, and a registration are written", async () => {
    const { c, p } = await login(PORT, "Student");
    await p.goto(`/subject/bt/topic/${T1}/material/${T1}-notes`); await p.getByRole("button", { name: "Mark as completed" }).click(); await p.getByRole("button", { name: "Completed" }).waitFor(); await p.waitForLoadState("networkidle");
    await p.goto("/test/bt-stakeholders-test"); await p.getByRole("button", { name: /Start test|Resume test/ }).click(); await p.getByText("Question 1 of 8").waitFor();
    await p.getByRole("radio").nth(1).click(); await p.waitForTimeout(3500); await p.waitForLoadState("networkidle"); // autosave interval
    state = await c.storageState();
    const r = await browser.newContext({ baseURL: `http://localhost:${PORT}` }); const rp = await r.newPage(); await rp.goto("/register"); await rp.locator("#reg-name").fill("Restart Tester"); await rp.locator("#reg-email").fill("restart@example.com"); await rp.locator("#reg-password").fill("Restart-pass123"); await rp.locator("#reg-confirm").fill("Restart-pass123"); await rp.locator("#reg-terms").click(); await rp.getByRole("button", { name: "Create account" }).click(); await rp.waitForURL(/dashboard$/); await r.close(); await c.close();
  });
  pg.stop(); await down(PORT);
  pg = start(PORT, { DATA_PROVIDER: "prisma" }); await up(PORT);
  await step("after a server restart: the SAME session still works, completion persists, the unfinished attempt resumes with its saved answer, the new account can sign in", async () => {
    const c = await browser.newContext({ baseURL: `http://localhost:${PORT}`, storageState: state }); const p = await c.newPage();
    await p.goto(`/subject/bt/topic/${T1}/material/${T1}-notes`); await p.getByRole("button", { name: "Completed" }).waitFor();
    await p.goto("/test/bt-stakeholders-test"); const resume = p.getByRole("button", { name: /Resume test/ }); if (await resume.isVisible({ timeout: 3000 }).catch(() => false)) await resume.click(); await p.getByText("Question 1 of 8").waitFor();
    assert.equal(await p.getByRole("radio", { checked: true }).count(), 1, "the autosaved answer is restored");
    await c.close();
    const r = await browser.newContext({ baseURL: `http://localhost:${PORT}` }); const rp = await r.newPage(); await rp.goto("/login"); await rp.locator("#login-email").fill("restart@example.com"); await rp.locator("#login-password").fill("Restart-pass123"); await rp.getByRole("button", { name: "Sign in", exact: true }).click(); await rp.waitForURL(/dashboard$/); await r.close();
  });
  await step("a SUBMITTED attempt and its frozen result survive a restart (review, history, progress)", async () => {
    const c = await browser.newContext({ baseURL: `http://localhost:${PORT}`, storageState: state }); const p = await c.newPage();
    await p.goto("/test/bt-stakeholders-test"); const resume = p.getByRole("button", { name: /Resume test/ }); if (await resume.isVisible({ timeout: 3000 }).catch(() => false)) await resume.click(); await p.getByText("Question 1 of 8").waitFor();
    await p.getByRole("button", { name: "Submit test" }).first().click(); await p.getByRole("dialog").getByRole("button", { name: "Submit now" }).click(); await p.waitForURL(/\/result/); const result = (await p.locator("main").innerText()).replace(/\s+/g, " "); const url = p.url(); await c.close();
    pg.stop(); await down(PORT); pg = start(PORT, { DATA_PROVIDER: "prisma" }); await up(PORT);
    const c2 = await browser.newContext({ baseURL: `http://localhost:${PORT}`, storageState: state }); const p2 = await c2.newPage(); await p2.goto(url); await p2.locator("#review").getByText("Explanation").first().waitFor();
    assert.equal((await p2.locator("main").innerText()).replace(/\s+/g, " "), result, "the stored result is identical after the restart");
    await p2.goto("/progress"); await p2.getByText(/Stakeholders — topic test/).first().waitFor(); await c2.close();
  });

  // ── parity: the same fresh seed through both providers renders the same pages
  pg.stop(); await down(PORT); sh(["prisma/reset-dev.ts"]); sh(["prisma/seed.ts"]);
  pg = start(PORT, { DATA_PROVIDER: "prisma" }); const mem = start(MEM_PORT, { DATA_PROVIDER: "memory" }); await up(PORT); await up(MEM_PORT);
  await step("memory vs PostgreSQL parity: the same pages show the same content for the demo learner and the demo admin", async () => {
    const learner = ["/dashboard", "/courses", "/platform/acca", "/subject/bt", `/subject/bt/topic/${T1}`, "/exams", "/progress", "/ranking", "/certificates", "/payments", "/notifications"];
    const admin = ["/admin", "/admin/platforms", "/admin/subjects", "/admin/topics", "/admin/materials", "/admin/question-bank", "/admin/tests", "/admin/students", "/admin/access", "/admin/payments", "/admin/certificates", "/admin/statistics", "/admin/exams"];
    const norm = (t) => t.replace(/\s+/g, " ").replace(/Couldn’t load this file\. Try opening it in a new tab\. ?/g, "") /* async <video> error: CI Chromium has no H.264 */.replace(/\b\d+ (minutes?|hours?|days?) ago\b/g, "<ago>").replace(/AU-\d{4}-\d{6}/g, "AU-<n>").replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, \d{4}\b/g, "<date>").trim();
    const diffs = [];
    for (const [who, pages] of [["Student", learner], ["Admin", admin]]) {
      const a = await login(PORT, who); const b = await login(MEM_PORT, who);
      for (const path of pages) { await a.p.goto(path); await b.p.goto(path); await a.p.waitForLoadState("networkidle"); await b.p.waitForLoadState("networkidle"); const [x, y] = [norm(await a.p.locator("main").innerText()), norm(await b.p.locator("main").innerText())]; if (x !== y) { let i = 0; while (x[i] === y[i]) i++; diffs.push(`${who} ${path}\n   PG : …${x.slice(Math.max(0, i - 40), i + 80)}\n   MEM: …${y.slice(Math.max(0, i - 40), i + 80)}`); } }
      await a.c.close(); await b.c.close();
    }
    assert.equal(diffs.length, 0, `${diffs.length} page(s) differ:\n${diffs.join("\n")}`);
  });
  mem.stop();
} catch (e) { results.push(false); console.log("  FATAL", e.message); }
finally { pg?.stop(); await browser.close(); }
const failed = results.filter((r) => !r).length; console.log(`\n${results.length - failed}/${results.length} steps passed`); process.exit(failed ? 1 : 0);
