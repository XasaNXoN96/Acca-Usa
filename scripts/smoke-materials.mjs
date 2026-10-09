// Smoke test: Student Material Viewer. BASE_URL=http://localhost:3100 CHROMIUM=... node scripts/smoke-materials.mjs  (fresh server)
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const step = async (name, fn) => { try { await fn(); results.push([name, true]); console.log("  ok  ", name); } catch (e) { results.push([name, false]); console.log("  FAIL", name, "\n      ", String(e.message).split("\n")[0]); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (o = {}) => { const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, ...o }); await c.addCookies([{ name: "NEXT_LOCALE", value: o.locale ?? "en", url: BASE }]); return c; };
const demo = async (p, who) => { await p.goto("/login"); await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); };
const over = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const T1 = "bt-business-organisations-and-their-stakeholders";
const M = (suffix) => `/subject/bt/topic/${T1}/material/${T1}-${suffix}`;
const kinds = { notes: "notes", video: "video", pdf: "pdf", audio: "audio", image: "diagram", file: "glossary" };

// ---------- guest ----------
const gc = await ctx(); const guest = await gc.newPage();
await step("guest: Subject shows topics; expanding a topic shows locked materials; click → Login modal", async () => {
  await guest.goto("/subject/bt"); await guest.getByRole("heading", { name: "Course Topics" }).waitFor();
  await guest.locator("[data-topic-row] button").first().click(); await guest.waitForTimeout(350);
  const mats = guest.locator("[data-material-row] button"); assert((await mats.count()) >= 7, `materials ${await mats.count()}`);
  await mats.first().click(); await guest.getByRole("dialog").getByText("To study this material, sign in to your account.").waitFor();
  await guest.getByRole("button", { name: "Cancel" }).click();
});
await step("guest cannot reach the viewer or the files (redirect to login / 401)", async () => {
  await guest.goto(M("video")); await guest.waitForURL(/\/login\?next=/);
  for (const id of ["seed-bt-lecture", "seed-bt-overview", "seed-bt-audio", "seed-bt-diagram", "seed-bt-glossary"]) assert((await gc.request.get(`/api/files/${id}`)).status() === 401, `${id} reachable by guest`);
  const html = await (await gc.request.get("/subject/bt")).text(); assert(!html.includes("seed-bt-") && !html.includes("/api/files"), "file ids leaked into the public page");
});
await gc.close();

// ---------- student ----------
const sc = await ctx(); const s = await sc.newPage();
await step("student login → Subject → Topic → materials list → open material", async () => {
  await demo(s, "Student"); await s.waitForURL(/dashboard$/);
  await s.goto("/courses"); await s.goto("/subject/bt");
  await s.getByRole("link", { name: /Business organisations and their stakeholders/ }).first().click(); await s.waitForURL(new RegExp(`/topic/${T1}$`));
  const items = s.locator("[data-material-item]"); assert((await items.count()) === 7, `list ${await items.count()}`);
  await items.nth(1).getByRole("link").click(); await s.waitForURL(/\/material\//); await s.getByRole("heading", { level: 1 }).waitFor();
});
await step("video viewer: player, play/pause, duration, correct headers", async () => {
  await s.goto(M("video")); const v = s.locator("video"); await v.waitFor();
  const r = await sc.request.get("/api/files/seed-bt-lecture", { headers: { Range: "bytes=0-99" } });
  assert(r.status() === 206 && r.headers()["content-type"] === "video/mp4" && r.headers()["x-content-type-options"] === "nosniff", `range ${r.status()}`);
  const canPlay = await v.evaluate((el) => el.canPlayType('video/mp4; codecs="avc1.42E01E"'));
  if (canPlay) { await s.waitForFunction(() => document.querySelector("video").readyState >= 1); const d = await v.evaluate((el) => el.duration); assert(d > 3 && d < 5, `duration ${d}`);
    await v.evaluate((el) => el.play()); await s.waitForFunction(() => !document.querySelector("video").paused); await v.evaluate((el) => el.pause()); assert(await v.evaluate((el) => el.paused), "did not pause"); }
  else console.log("      (note: this Chromium build has no H.264 — playback not exercised, element + headers verified)");
  assert(await v.evaluate((el) => el.controls), "no controls");
});
await step("PDF viewer: controlled reader (canvas, page + zoom controls, watermark) — NO iframe, Open, Download or Print for the student", async () => {
  await s.goto(M("pdf")); const r = s.locator("[data-pdf-reader]"); await r.waitFor(); assert((await r.getAttribute("data-src")) === "/api/files/seed-bt-overview", "reader source");
  assert((await s.locator("iframe").count()) === 0, "browser PDF viewer (with its download / print toolbar) is embedded");
  await s.waitForFunction(() => { const c = document.querySelector("[data-pdf-reader] canvas"); return c && c.width > 100 && c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 !== 3 && v < 250); }, null, { timeout: 20000 });
  for (const name of ["Previous page", "Next page", "Zoom in", "Zoom out"]) await s.getByRole("button", { name }).waitFor();
  const before = await s.locator("[data-pdf-reader] canvas").evaluate((c) => c.width); await s.getByRole("button", { name: "Zoom in" }).click(); await s.waitForFunction((w) => document.querySelector("[data-pdf-reader] canvas").width > w, before);
  await s.getByText("View-only document. It cannot be downloaded or printed.").waitFor();
  for (const name of ["Open", "Download", "Print"]) assert((await s.getByRole("link", { name }).count()) + (await s.getByRole("button", { name }).count()) === 0, `${name} control present`);
  const res = await sc.request.get("/api/files/seed-bt-overview"); assert(res.headers()["content-type"] === "application/pdf" && /inline/.test(res.headers()["content-disposition"]) && /no-store/.test(res.headers()["cache-control"]), "pdf headers");
  await s.emulateMedia({ media: "print" }); assert(await s.locator("[data-pdf-reader]").evaluate((el) => getComputedStyle(el).display) === "none", "the reader is printed"); await s.emulateMedia({ media: "screen" });
});
await step("Text viewer: formatted paragraphs and list", async () => {
  await s.goto(M("notes")); const a = s.locator("article"); await a.waitFor(); assert((await a.locator("p").count()) >= 1 && (await a.locator("li").count()) >= 3, "text blocks");
});
await step("Image viewer: renders, opens lightbox", async () => {
  await s.goto(M("diagram")); const img = s.locator("main img[alt]").first(); await img.waitFor();
  await s.waitForFunction(() => { const i = document.querySelector("main img[alt]"); return i && i.complete && i.naturalWidth > 0; });
  await s.getByRole("button", { name: /Enlarge image/ }).click(); const d = s.getByRole("dialog"); await d.locator("img").waitFor(); await s.keyboard.press("Escape"); await d.waitFor({ state: "detached" });
});
await step("Audio viewer: player with duration", async () => {
  await s.goto(M("audio")); const a = s.locator("audio"); await a.waitFor(); await s.waitForFunction(() => document.querySelector("audio").readyState >= 1, null, { timeout: 15000 });
  const d = await a.evaluate((el) => el.duration); assert(d > 5 && d < 7, `duration ${d}`);
  await a.evaluate((el) => el.play()); await s.waitForFunction(() => !document.querySelector("audio").paused); await a.evaluate((el) => el.pause());
});
await step("General file: student sees name / type / size and the TEXT, with no Open / Download; the server refuses downloads", async () => {
  await s.goto(M("glossary")); await s.getByText("glossary.txt").waitFor(); await s.getByText("TXT", { exact: true }).waitFor(); await s.getByText(/\d+ KB|\d+(\.\d)? MB/).first().waitFor();
  await s.getByText(/Stakeholder: any person or group affected/).waitFor();
  for (const name of ["Open", "Download"]) assert((await s.getByRole("link", { name }).count()) === 0, `${name} link present`);
  const dl = await sc.request.get("/api/files/seed-bt-glossary?download=1"); assert(dl.status() === 403, `student download status ${dl.status()}`); assert(!/attachment/.test(dl.headers()["content-disposition"] ?? ""), "attachment for a student");
  const ok = await sc.request.get("/api/files/seed-bt-glossary"); assert(ok.status() === 200 && /inline/.test(ok.headers()["content-disposition"]), "inline text");
  assert((await ac.request.get("/api/files/seed-bt-glossary?download=1")).headers()["content-disposition"]?.startsWith("attachment"), "admin cannot download");
});
await step("View-only policy on every material page: no download / open-original / print control for the student; direct download URLs refused", async () => {
  for (const k of ["notes", "video", "pdf", "audio", "diagram", "glossary"]) {
    await s.goto(M(k)); await s.waitForLoadState("networkidle"); const html = await s.content();
    assert(!/download=1|download="|>Download<|Open original|Download PDF/i.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), `${k}: a download affordance is present`);
    assert((await s.locator("a[href*='/api/files/']").count()) === 0, `${k}: a direct file link is present`);
  }
  await s.goto(M("video")); assert((await s.locator("video").getAttribute("controlslist")) === "nodownload noremoteplayback", "video controlslist");
  for (const id of ["seed-bt-lecture", "seed-bt-overview", "seed-bt-audio", "seed-bt-diagram", "seed-bt-glossary"]) assert((await sc.request.get(`/api/files/${id}?download=1`)).status() === 403, `${id}: ?download=1`);
});
await step("Mark as completed → ✓ Completed (persists after reload, shows in topic list, can be undone)", async () => {
  await s.goto(M("notes")); const b = s.getByRole("button", { name: "Mark as completed" }); await b.click();
  await s.getByRole("button", { name: "Completed" }).waitFor(); await s.waitForLoadState("networkidle"); await s.reload(); await s.getByRole("button", { name: "Completed" }).waitFor();
  assert((await s.getByRole("button", { name: "Completed" }).getAttribute("aria-pressed")) === "true", "aria-pressed");
  await s.goto(`/subject/bt/topic/${T1}`); await s.getByText("1 of 7 completed").waitFor();
  await s.goto(M("notes")); await s.getByRole("button", { name: "Completed" }).click(); await s.getByRole("button", { name: "Mark as completed" }).waitFor();
});
await step("Previous / Next navigation follows the topic's material order", async () => {
  await s.goto(M("video")); await s.getByRole("link", { name: "Next material" }).click(); await s.waitForURL(/-pdf$/);
  await s.getByRole("link", { name: "Previous material" }).click(); await s.waitForURL(/-video$/);
  await s.goto(M("notes")); assert((await s.getByRole("link", { name: "Previous material" }).count()) === 0, "prev on first"); await s.getByRole("link", { name: "Back to topic" }).waitFor();
});
await step("Breadcrumbs: My Platforms → ACCA → BT → Topic → Material, links work", async () => {
  await s.goto(M("video")); const nav = s.getByRole("navigation", { name: "Breadcrumb" }); await nav.waitFor();
  for (const x of ["My Platforms", "ACCA", "BT", "Business organisations and their stakeholders"]) await nav.getByRole("link", { name: x, exact: true }).waitFor();
  await nav.getByRole("link", { name: "BT", exact: true }).click(); await s.waitForURL(/\/subject\/bt$/);
  await s.goBack(); await nav.getByRole("link", { name: "Business organisations and their stakeholders" }).click(); await s.waitForURL(new RegExp(`/topic/${T1}$`));
});

// ---------- access control ----------
await step("not-enrolled user: viewer redirects to the platform page, files are 403", async () => {
  const c = await ctx(); const p = await c.newPage(); await p.goto("/register");
  await p.locator("#reg-name").fill("Mat Tester"); await p.locator("#reg-email").fill(`mat.${Date.now()}@example.com`);
  await p.locator("#reg-password").fill("Mat-pass12345"); await p.locator("#reg-confirm").fill("Mat-pass12345"); await p.locator("#reg-terms").click();
  await p.getByRole("button", { name: "Create account" }).click(); await p.waitForURL(/dashboard$/);
  await p.goto(M("video")); await p.waitForURL(/\/platform\/acca/);
  assert((await c.request.get("/api/files/seed-bt-lecture")).status() === 403, "file not 403");
  await c.close();
});
await step("wrong topic/material ids → 404; locked topic → locked state; file of a locked topic → 403; admin can open it", async () => {
  const notFoundText = async (path) => /could.?n.t find|not found/i.test(await (await sc.request.get(path)).text());
  assert(await notFoundText(`/subject/bt/topic/${T1}/material/nope`), "unknown material is not a 404 page");
  assert(await notFoundText(`/subject/bt/topic/bt-business-environment/material/${T1}-video`), "material under another topic is served");
  // admin attaches a file to a LOCKED topic; the student must not get it, the admin must
  const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
  const topics = await (await sc.request.get("/subject/bt")).text(); void topics;
  await a.goto("/admin/materials"); await a.getByRole("button", { name: "Add material" }).click();
  await a.locator("#f-title").fill("Locked-topic handout"); await a.locator("#f-kind").selectOption("file"); await a.locator("#f-subject").selectOption({ label: "BT — Business and Technology" });
  await a.locator("#f-topic").selectOption({ label: "Communication and teamwork" });
  await a.locator("#f-fileId").setInputFiles({ name: "locked.txt", mimeType: "text/plain", buffer: Buffer.from("secret handout for a locked topic") });
  await a.getByText("Uploaded").first().waitFor(); await a.getByRole("button", { name: "Save", exact: true }).click(); await a.getByText("Saved.").waitFor();
  await a.goto("/subject/bt/topic/bt-communication-and-teamwork"); await a.getByRole("link", { name: /Locked-topic handout/ }).click(); await a.waitForURL(/\/material\//);
  await a.getByText("locked.txt").waitFor();                               // admin sees the file card
  const url = a.url(); const fileHref = await a.getByRole("link", { name: "Open" }).getAttribute("href");
  assert((await ac.request.get(fileHref)).status() === 200, "admin cannot fetch file");
  const res = await sc.request.get(url.replace(BASE, "")); const html = await res.text();
  assert(!html.includes("locked.txt") && /This topic is locked/.test(html), "student sees a locked topic's material");
  assert((await sc.request.get(fileHref)).status() === 403, "student fetched a locked topic's file");
  await ac.close();
});
await step("admin opens a material and the viewer works for admin", async () => {
  const ac = await ctx(); const a = await ac.newPage(); await demo(a, "Admin"); await a.waitForURL(/admin$/);
  await a.goto(M("video")); await a.locator("video").waitFor(); await a.goto(M("diagram")); await a.locator("main img[alt]").first().waitFor(); await ac.close();
});

// ---------- responsive ----------
const studentState = await sc.storageState(); // reuse the session (login is rate limited)
await step("responsive 360/390/768/1024/1280/1440: video, PDF, audio, image, text, file — no overflow", async () => {
  for (const w of [360, 390, 768, 1024, 1280, 1440]) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: w, height: 800 }, hasTouch: w < 1024, storageState: studentState }); const p = await c.newPage();
    for (const [kind, suffix] of Object.entries(kinds)) {
      await p.goto(M(suffix)); await p.locator(`[data-material-kind=${kind === "image" ? "image" : kind}]`).waitFor(); await p.waitForTimeout(250);
      assert((await over(p)) <= 0, `${w}/${kind}: overflow ${await over(p)}`);
      const box = await p.locator(`[data-material-kind]`).boundingBox(); assert(box.x >= 0 && box.x + box.width <= w + 1, `${w}/${kind}: outside viewport`);
    }
    await c.close();
  }
});
await step("RU + UZ strings in the viewer", async () => {
  for (const [loc, mark, next] of [["ru", "Отметить как пройденное", "Следующий материал"], ["uz", "O‘tilgan deb belgilash", "Keyingi material"]]) {
    const c = await ctx({ locale: loc }); const p = await c.newPage(); await p.goto("/login"); await p.getByRole("button", { name: loc === "ru" ? "Студент" : "Talaba", exact: true }).click();
    await p.getByRole("button", { name: loc === "ru" ? "Войти" : "Kirish", exact: true }).click(); await p.waitForURL(/dashboard$/); await p.goto(M("notes"));
    await p.getByRole("button", { name: mark }).waitFor(); await p.getByRole("link", { name: next }).waitFor(); await c.close();
  }
});

await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`); process.exit(failed.length ? 1 : 0);
