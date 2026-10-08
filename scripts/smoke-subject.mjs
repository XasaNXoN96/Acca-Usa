// Smoke test: public subject outline (topics only, locked), accordion, login redirect with next, dynamic topic list.
//   BASE_URL=http://localhost:3100 CHROMIUM=/path/to/chrome node scripts/smoke-subject.mjs   (use a freshly started server)
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push([name, true]); console.log(`  ok   ${name}`); }
  catch (e) { results.push([name, false]); console.log(`  FAIL ${name}\n       ${String(e.message).split("\n")[0]}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]); return c; };
const rows = (page) => page.locator("[data-topic-row]");
const countBadge = async (page) => Number((await page.locator("#course-topics + span").innerText()).match(/\d+/)[0]);

const anon = await ctx(); const page = await anon.newPage();
let firstTopicHref = "", n0 = 0;

await step("anonymous /subject/bt shows the topic list (public, no redirect)", async () => {
  await page.goto("/subject/bt"); assert(new URL(page.url()).pathname === "/subject/bt", "redirected");
  await page.getByRole("heading", { name: "Course Topics" }).waitFor();
  n0 = await rows(page).count(); assert(n0 >= 1, "no topics");
  assert((await countBadge(page)) === n0, `badge ≠ rows (${await countBadge(page)} vs ${n0})`);
  await page.getByText("Business and Technology").first().waitFor();
});
await step("topics are numbered 01.. and all show the locked state", async () => {
  const first = (await rows(page).first().innerText()); assert(/01/.test(first), "no 01 number");
  assert((await page.getByText("Locked", { exact: true }).count()) >= n0, "not all topics are locked");
});
await step("NO materials, tests, answers or file URLs in the public HTML (BT and MA)", async () => {
  for (const slug of ["bt", "ma"]) {
    const html = await (await anon.request.get(`/subject/${slug}`)).text();
    // (UI strings such as "Take the topic test" legitimately ship in the message dictionary — only DATA is checked)
    for (const leak of ["/api/files", "seed-ma-workbook", "— study notes", "sample workbook", "Cost classification — topic test", "Introduction to management accounting — quiz", "q-fixed-cost", "Factory rent stays the same", "correctOptionId", "<video", "<audio", "<iframe"]) assert(!html.includes(leak), `/subject/${slug} leaks "${leak}"`);
  }
  assert((await page.locator("video,audio,iframe,img[src*='/api/files']").count()) === 0, "media element on public page");
  for (const w of ["Materials", "Tests"]) assert((await page.getByRole("link", { name: w, exact: true }).count()) === 0, `"${w}" tab visible to the public`);
});
await step("accordion expands/collapses (mouse + keyboard) and shows only number/title/access", async () => {
  const t = rows(page).first().locator("button").first();
  assert((await t.getAttribute("aria-expanded")) === "false", "should start collapsed");
  await t.click(); await page.waitForTimeout(350); assert((await t.getAttribute("aria-expanded")) === "true", "did not expand");
  const panel = page.locator("[role=region][data-state=open]").first();
  await panel.getByText("Sign in to open this topic.").waitFor();
  firstTopicHref = await panel.getByRole("link").first().getAttribute("href");
  assert((await panel.getByRole("link").count()) === 1, "panel should contain only the call-to-action");
  await t.click(); await page.waitForTimeout(350); assert((await t.getAttribute("aria-expanded")) === "false", "did not collapse");
  await t.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(300); assert((await t.getAttribute("aria-expanded")) === "true", "Enter did not expand");
  await t.click();
});
await step("clicking the CTA of a locked topic → /login?next=<topic url>", async () => {
  assert(/^\/login\?next=%2Fsubject%2Fbt%2Ftopic%2F/.test(firstTopicHref), `href ${firstTopicHref}`);
  const t = rows(page).first().locator("button").first(); await t.click();
  await page.locator("[role=region][data-state=open]").first().getByRole("link").first().click();
  await page.waitForURL(/\/login\?next=%2Fsubject%2Fbt%2Ftopic%2F/);
});
await step("anonymous direct topic URL and legacy /topic/<id> also go to login with next", async () => {
  const topicPath = decodeURIComponent(new URL(page.url()).searchParams.get("next"));
  const c = await ctx(); const p = await c.newPage();
  await p.goto(topicPath); await p.waitForURL(/\/login\?next=%2Fsubject%2Fbt%2Ftopic%2F/);
  await p.goto("/topic/bt-business-environment"); await p.waitForURL(/\/login\?next=%2Ftopic%2F/); await c.close();
});
let target = "";
await step("Demo Student login returns to the chosen topic (not the dashboard)", async () => {
  target = decodeURIComponent(new URL(page.url()).searchParams.get("next"));
  await page.getByRole("button", { name: "Student", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === target, { timeout: 15000 });
  await page.locator("h1").first().waitFor();
  assert(!/dashboard/.test(page.url()), "landed on dashboard");
});
await step("signed-in enrolled student sees their workspace on /subject/bt (tabs, not the public outline)", async () => {
  await page.goto("/subject/bt"); await page.getByRole("link", { name: "Materials", exact: true }).waitFor();
  assert((await page.getByRole("heading", { name: "Course Topics" }).count()) === 0, "public outline shown to enrolled student");
});

// ---------- dynamic list via Admin → Topics ----------
const ac = await ctx(); const admin = await ac.newPage();
const title = `Smoke Added Topic ${String(Date.now()).slice(-5)}`;
await step("admin adds a topic to BT → public page shows N+1 with the new topic last", async () => {
  await admin.goto("/login"); await admin.getByRole("button", { name: "Admin", exact: true }).click();
  await admin.getByRole("button", { name: "Sign in", exact: true }).click(); await admin.waitForURL(/\/admin$/);
  await admin.goto("/admin/topics"); await admin.getByRole("button", { name: "Add topic" }).click();
  await admin.locator("#f-title").fill(title); await admin.locator("#f-subject").selectOption({ label: "BT — Business and Technology" });
  await admin.locator("#f-durationMinutes").fill("20"); await admin.locator("#f-lessonCount").fill("1");
  await admin.getByRole("button", { name: "Save", exact: true }).click(); await admin.getByText("Saved.").waitFor();
  await page.context().clearCookies(); await page.goto("/subject/bt");
  assert((await rows(page).count()) === n0 + 1, `rows ${await rows(page).count()} ≠ ${n0 + 1}`);
  assert((await countBadge(page)) === n0 + 1, "badge not updated");
  const last = rows(page).last(); await last.getByText(title).waitFor();
  await last.getByText(String(n0 + 1).padStart(2, "0"), { exact: true }).first().waitFor();
});
await step("admin archives it → back to N and numbering is contiguous", async () => {
  await admin.goto("/admin/topics"); await admin.locator("#admin-search").fill(title);
  await admin.getByRole("button", { name: new RegExp(`^Archive: ${title}`) }).click();
  await admin.getByRole("button", { name: "Archive", exact: true }).click(); await admin.getByText(/Record archived/).waitFor();
  await page.goto("/subject/bt"); assert((await rows(page).count()) === n0, "count did not return");
  const nums = await rows(page).locator("button span[aria-hidden]").evaluateAll((els) => els.map((e) => e.textContent).filter((x) => /^\d\d$/.test(x ?? "")));
  assert(nums.every((x, i) => Number(x) === i + 1), `numbering not contiguous: ${nums}`);
});
await step("same behaviour for other subjects/platforms (MA, CIMA E1, FIA FAB)", async () => {
  for (const slug of ["ma", "fa", "lw", "cima-e1", "cima-f3", "fab", "ffa"]) {
    await page.goto(`/subject/${slug}`); await page.getByRole("heading", { name: "Course Topics" }).waitFor();
    const n = await rows(page).count(); assert(n >= 1 && (await countBadge(page)) === n, `${slug}: count mismatch`);
    assert((await page.getByText("Locked", { exact: true }).count()) >= n, `${slug}: not locked`);
  }
});
await step("signed-in user WITHOUT access sees locked outline with an Enroll CTA", async () => {
  const c = await ctx(); const p = await c.newPage(); const email = `subj.${Date.now()}@example.com`;
  await p.goto("/register"); await p.locator("#reg-name").fill("Subject Tester"); await p.locator("#reg-email").fill(email);
  await p.locator("#reg-password").fill("Subject-pass1"); await p.locator("#reg-confirm").fill("Subject-pass1"); await p.locator("#reg-terms").click();
  await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard/);
  await p.goto("/subject/bt"); await p.getByRole("heading", { name: "Course Topics" }).waitFor();
  await rows(p).first().locator("button").first().click();
  await p.locator("[role=region][data-state=open]").first().getByText("Enroll in ACCA to unlock this topic.").waitFor();
  await p.locator("[role=region][data-state=open]").first().getByRole("link").first().click(); await p.waitForURL(/\/platform\/acca/);
  await p.goto("/subject/bt/topic/bt-business-environment"); await p.waitForURL(/\/platform\/acca/); await c.close();
});
await step("register keeps ?next (new account returns to the chosen topic route)", async () => {
  const c = await ctx(); const p = await c.newPage();
  await p.goto("/register?next=%2Fsubject%2Fbt%2Ftopic%2Fbt-business-environment");
  await p.locator("#reg-name").fill("Next Tester"); await p.locator("#reg-email").fill(`next.${Date.now()}@example.com`);
  await p.locator("#reg-password").fill("Next-pass12"); await p.locator("#reg-confirm").fill("Next-pass12"); await p.locator("#reg-terms").click();
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL(/\/platform\/acca/); // not enrolled yet → the platform gate; the topic route itself was reached
  await c.close();
});
await step("responsive: public subject page + open accordion at 360/390/768/1024/1280/1440", async () => {
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const c = await ctx({ viewport: { width: w, height: 800 }, hasTouch: w < 1024 }); const p = await c.newPage();
    await p.goto("/subject/ma"); await p.getByRole("heading", { name: "Course Topics" }).waitFor();
    const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert((await over()) <= 0, `${w}: overflow`);
    const t = rows(p).nth(1).locator("button").first(); await t.click(); await p.waitForTimeout(350);
    assert((await over()) <= 0, `${w}: overflow with item open`);
    const box = await t.boundingBox(); assert(box.height >= 44, `${w}: row too small (${box.height})`);
    const vis = await p.locator("[role=region][data-state=open]").first().getByRole("link").first().boundingBox(); assert(vis && vis.x >= 0 && vis.x + vis.width <= w, `${w}: CTA outside viewport`);
    await c.close();
  }
});

await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
