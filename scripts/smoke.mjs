// End-to-end smoke test (Playwright + system Chromium).  Usage:
//   npm run build && npm start -- -p 3100   (in another terminal)
//   BASE_URL=http://localhost:3100 CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run smoke
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
let focus = null; // last page used for login — screenshotted on failure when SMOKE_SHOTS is set
const step = async (name, fn) => {
  try { await fn(); results.push([name, true]); console.log(`  ok   ${name}`); }
  catch (e) {
    results.push([name, false, String(e.message).split("\n")[0]]);
    console.log(`  FAIL ${name}\n       ${String(e.message).split("\n")[0]}`);
    if (focus && process.env.SMOKE_SHOTS) await focus.screenshot({ path: `${process.env.SMOKE_SHOTS}/fail-${results.length}.png` }).catch(() => {});
  }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = async (opts = {}) => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE, ...opts });
  await c.addCookies([{ name: "NEXT_LOCALE", value: opts.locale ?? "en", url: BASE }]);
  return c;
};

const stamp = Date.now();
const email = `smoke.${stamp}@example.com`;
const pass1 = "Smoke-pass1";
const pass2 = "Smoke-pass2";

// ---------- tiny valid files (magic bytes are what the server checks) ----------
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000100" + "05fe02fea7e2f7340000000049454e44ae426082", "hex");
const mp3 = Buffer.concat([Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00"), Buffer.alloc(512, 0xff)]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(64)]);
const txtAsPng = Buffer.from("this is not a png");

async function login(page, em, pw, buttonName = "Sign in") {
  focus = page;
  await page.goto("/login");
  await page.locator("#login-email").fill(em);
  await page.locator("#login-password").fill(pw);
  await page.getByRole("button", { name: buttonName, exact: true }).click();
}
async function logout(page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

console.log(`Smoke test against ${BASE}`);

// =============== AUTH + PROTECTED ROUTES ===============
{
  const c = await ctx(); const page = await c.newPage();
  await step("anonymous /dashboard redirects to /login?next=", async () => {
    await page.goto("/dashboard"); await page.waitForURL(/\/login\?next=%2Fdashboard/);
  });
  await step("anonymous /admin redirects to /login", async () => { await page.goto("/admin/subjects"); await page.waitForURL(/\/login\?next=/); });
  await step("anonymous cannot read /api/files", async () => { const r = await page.request.get("/api/files/seed-ma-workbook"); assert(r.status() === 401, `status ${r.status()}`); });
  await step("anonymous cannot upload", async () => { const r = await page.request.post("/api/uploads", { multipart: { kind: "pdf", file: { name: "a.pdf", mimeType: "application/pdf", buffer: pdf } } }); assert(r.status() === 403, `status ${r.status()}`); });

  await step("register: weak password rejected client-side", async () => {
    await page.goto("/register");
    await page.locator("#reg-name").fill("Smoke Tester"); await page.locator("#reg-email").fill(email);
    await page.locator("#reg-password").fill("short"); await page.locator("#reg-confirm").fill("short");
    await page.locator("#reg-terms").click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Password must be at least 8 characters.").first().waitFor();
  });
  await step("password show/hide toggle", async () => {
    const input = page.locator("#reg-password");
    assert((await input.getAttribute("type")) === "password", "should start hidden");
    await page.getByRole("button", { name: "Show password" }).first().click();
    assert((await input.getAttribute("type")) === "text", "should be visible");
  });
  await step("register creates student and lands on dashboard", async () => {
    await page.locator("#reg-password").fill(pass1); await page.locator("#reg-confirm").fill(pass1);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/dashboard/);
    await page.getByText("Choose your first platform").first().waitFor();
  });
  await step("logout clears session", async () => { await logout(page); await page.goto("/dashboard"); await page.waitForURL(/\/login/); });
  await step("duplicate email is rejected", async () => {
    await page.goto("/register");
    await page.locator("#reg-name").fill("Dup"); await page.locator("#reg-email").fill(email);
    await page.locator("#reg-password").fill(pass1); await page.locator("#reg-confirm").fill(pass1);
    await page.locator("#reg-terms").click(); await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("An account with this email already exists.").waitFor();
  });
  await step("wrong password shows a generic error", async () => { await login(page, email, "Wrong-pass9"); await page.getByText("Incorrect email or password.").waitFor(); });
  await step("student login → dashboard; /admin bounces to /dashboard", async () => {
    await login(page, email, pass1); await page.waitForURL(/\/dashboard/);
    await page.goto("/admin"); await page.waitForURL(/\/dashboard/);
  });
  await step("login/register pages redirect when signed in", async () => { await page.goto("/login"); await page.waitForURL(/\/dashboard/); });

  await step("forgot password (demo link) → reset → login with new password", async () => {
    await logout(page);
    await page.goto("/forgot-password");
    await page.locator("#forgot-email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText("Check your inbox").waitFor();
    await page.getByRole("link", { name: "Open reset link" }).click();
    await page.locator("#reset-password").fill(pass2); await page.locator("#reset-confirm").fill(pass2);
    await page.getByRole("button", { name: "Update password" }).click();
    await page.waitForURL(/\/login\?reset=1/);
    await login(page, email, pass1); await page.getByText("Incorrect email or password.").waitFor();
    await login(page, email, pass2); await page.waitForURL(/\/dashboard/);
  });
  await step("reset link is single-use", async () => {
    const c2 = await ctx(); const p2 = await c2.newPage();
    await p2.goto("/forgot-password"); await p2.locator("#forgot-email").fill(email);
    await p2.getByRole("button", { name: "Send reset link" }).click();
    const href = await p2.getByRole("link", { name: "Open reset link" }).getAttribute("href");
    await p2.goto(href);
    await p2.locator("#reset-password").fill(pass2); await p2.locator("#reset-confirm").fill(pass2);
    await p2.getByRole("button", { name: "Update password" }).click(); await p2.waitForURL(/reset=1/);
    await p2.goto(href);
    await p2.locator("#reset-password").fill("Third-pass4"); await p2.locator("#reset-confirm").fill("Third-pass4");
    await p2.getByRole("button", { name: "Update password" }).click();
    await p2.getByText("This reset link is invalid or has expired.").waitFor();
    await c2.close();
  });
  await c.close();
}

// =============== ADMIN: build content ===============
const subj = { code: `S${String(stamp).slice(-5)}`, name: "Smoke Subject" };
const topicTitle = "Smoke Topic One";
const adminCtx = await ctx(); const admin = await adminCtx.newPage();
let testTitle = `Smoke Test ${String(stamp).slice(-5)}`;

await step("admin login → admin dashboard", async () => {
  await login(admin, "admin@example.com", "Admin-Demo1"); await admin.waitForURL(/\/admin$/);
  await admin.getByRole("heading", { name: "Admin overview" }).waitFor();
});
await step("admin: edit platform name (validation + save)", async () => {
  await admin.goto("/admin/platforms");
  await admin.getByRole("button", { name: /^Edit: ACCA/ }).click();
  await admin.locator("#f-name").fill("A");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText(/Enter at least 2 characters|at least 2/i).first().waitFor();
  await admin.locator("#f-name").fill("ACCA");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText("Saved.").waitFor();
});
await step("admin: create subject", async () => {
  await admin.goto("/admin/subjects");
  await admin.getByRole("button", { name: "Add subject" }).click();
  await admin.locator("#f-code").fill(subj.code); await admin.locator("#f-name").fill(subj.name);
  await admin.locator("#f-level").selectOption({ label: "ACCA — Applied Knowledge" });
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText("Saved.").waitFor();
  await admin.locator("#admin-search").fill(subj.code); await admin.getByText(subj.name).first().waitFor();
});
await step("admin: create topic under the new subject", async () => {
  await admin.goto("/admin/topics");
  await admin.getByRole("button", { name: "Add topic" }).click();
  await admin.locator("#f-title").fill(topicTitle);
  await admin.locator("#f-subject").selectOption({ label: `${subj.code} — ${subj.name}` });
  await admin.locator("#f-durationMinutes").fill("30"); await admin.locator("#f-lessonCount").fill("2");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText("Saved.").waitFor();
});
await step("admin: notes material (text)", async () => {
  await admin.goto("/admin/materials");
  await admin.getByRole("button", { name: "Add material" }).click();
  await admin.locator("#f-title").fill("Smoke notes");
  await admin.locator("#f-kind").selectOption("notes");
  await admin.locator("#f-subject").selectOption({ label: `${subj.code} — ${subj.name}` });
  await admin.locator("#f-topic").selectOption({ label: topicTitle });
  await admin.locator("#f-body").fill("These are the smoke test notes for the topic.");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText("Saved.").waitFor();
});

async function uploadMaterial(title, kind, file, expectError) {
  await admin.goto("/admin/materials");
  await admin.getByRole("button", { name: "Add material" }).click();
  await admin.locator("#f-title").fill(title);
  await admin.locator("#f-kind").selectOption(kind);
  await admin.locator("#f-subject").selectOption({ label: `${subj.code} — ${subj.name}` });
  await admin.locator("#f-topic").selectOption({ label: topicTitle });
  await admin.locator("#f-fileId").setInputFiles(file);
  if (expectError) { await admin.getByText(expectError).first().waitFor(); await admin.keyboard.press("Escape"); return; }
  await admin.getByText("Uploaded").first().waitFor();
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText("Saved.").waitFor();
}
await step("upload: PDF", () => uploadMaterial("Smoke PDF", "pdf", { name: "smoke.pdf", mimeType: "application/pdf", buffer: pdf }));
await step("upload: PNG image", () => uploadMaterial("Smoke image", "image", { name: "smoke.png", mimeType: "image/png", buffer: png }));
await step("upload: MP3 audio", () => uploadMaterial("Smoke audio", "audio", { name: "smoke.mp3", mimeType: "audio/mpeg", buffer: mp3 }));
await step("upload: MP4 video", () => uploadMaterial("Smoke video", "video", { name: "smoke.mp4", mimeType: "video/mp4", buffer: mp4 }));
await step("upload rejects wrong extension for the kind", () => uploadMaterial("x", "image", { name: "smoke.pdf", mimeType: "application/pdf", buffer: pdf }, "not allowed"));
await step("upload rejects content that does not match the extension", () => uploadMaterial("x", "image", { name: "fake.png", mimeType: "image/png", buffer: txtAsPng }, "does not match"));
await step("upload API rejects forged request without session", async () => {
  const anon = await ctx(); const r = await anon.request.post("/api/uploads", { multipart: { kind: "image", file: { name: "a.png", mimeType: "image/png", buffer: png } } });
  assert(r.status() === 403, `status ${r.status()}`); await anon.close();
});

await step("admin: question bank — create 2 questions", async () => {
  for (const [i, q] of [["1", "What is 2 + 2 in the smoke test?"], ["2", "Which option is correct in smoke question two?"]]) {
    await admin.goto("/admin/question-bank");
    await admin.getByRole("button", { name: "Add question" }).click();
    await admin.locator("#f-subject").selectOption({ label: `${subj.code} — ${subj.name}` });
    await admin.locator("#f-text").fill(q);
    await admin.locator("#f-optionA").fill("Alpha"); await admin.locator("#f-optionB").fill("Bravo");
    await admin.locator("#f-optionC").fill("Charlie"); await admin.locator("#f-optionD").fill("Delta");
    await admin.locator("#f-correct").selectOption("b");
    await admin.locator("#f-explanation").fill(`Bravo is correct because smoke question ${i} says so.`);
    await admin.locator("#f-points").fill(i === "1" ? "1" : "3");
    await admin.locator("#f-difficulty").selectOption("medium");
    await admin.getByRole("button", { name: "Save", exact: true }).click();
    await admin.getByText("Saved.").waitFor();
  }
});
await step("admin: create test with questions, DRAFT (invisible to students)", async () => {
  await admin.goto("/admin/tests");
  await admin.getByRole("button", { name: "Add test" }).click();
  await admin.locator("#f-title").fill(testTitle);
  await admin.locator("#f-subject").selectOption({ label: `${subj.code} — ${subj.name}` });
  await admin.locator("#f-durationMinutes").fill("10"); await admin.locator("#f-passMark").fill("50");
  await admin.getByRole("group", { name: "Questions" }).getByText(/smoke test\?/).click();
  await admin.getByRole("group", { name: "Questions" }).getByText(/smoke question two/).click();
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText("Saved.").waitFor();
});

// =============== STUDENT: full learning flow ===============
const sc = await ctx(); const stu = await sc.newPage();
await step("student: login → My Platforms is empty → enroll in ACCA only", async () => {
  await login(stu, email, pass2); await stu.waitForURL(/\/dashboard/);
  await stu.goto("/courses");
  await stu.getByRole("button", { name: "Enroll (free in demo)" }).first().click();
  await stu.getByText("Enrolled").first().waitFor();
});
await step("platforms are separate: FIA is gated until enrolled", async () => {
  await stu.goto("/platform/fia"); await stu.getByText("Enroll to access FIA").waitFor();
  // a subject of a platform without access shows the PUBLIC outline (locked topics + Enroll CTA); the topic itself is gated
  await stu.goto("/subject/fab"); await stu.getByRole("heading", { name: "Course Topics" }).waitFor();
  await stu.getByText("Locked", { exact: true }).first().waitFor();
  await stu.goto("/subject/fab/topic/fab-introduction-and-syllabus-overview"); await stu.waitForURL(/\/platform\/fia/);
});
await step("student: subject → topic → notes + media render", async () => {
  await stu.goto("/subject/" + subj.code.toLowerCase());
  await stu.getByText(topicTitle).first().click();
  await stu.getByRole("tab", { name: "Notes" }).click();
  await stu.getByText("These are the smoke test notes for the topic.").waitFor();
  await stu.getByRole("tab", { name: "Video" }).click(); assert(await stu.locator("video").count() === 1, "video element missing");
  await stu.getByRole("tab", { name: "Audio" }).click(); assert(await stu.locator("audio").count() === 1, "audio element missing");
  await stu.getByRole("tab", { name: "PDF" }).click(); assert(await stu.locator("iframe").count() >= 1, "pdf iframe missing");
});
await step("student can fetch an enrolled file; unauthenticated cannot", async () => {
  const href = await stu.locator("iframe").first().getAttribute("src");
  const ok = await stu.request.get(href); assert(ok.status() === 200 && (ok.headers()["content-type"] ?? "").includes("pdf"), `status ${ok.status()}`);
  assert(ok.headers()["x-content-type-options"] === "nosniff", "nosniff missing");
  const anon = await ctx(); const r = await anon.request.get(href); assert(r.status() === 401, `anon status ${r.status()}`); await anon.close();
});
await step("student: draft test is hidden; admin publishes it", async () => {
  await stu.goto("/subject/" + subj.code.toLowerCase() + "?tab=tests"); await stu.getByText("No tests are available for this subject yet.").waitFor();
  await admin.goto("/admin/tests");
  await admin.getByRole("button", { name: new RegExp(`^Edit: ${testTitle}`) }).click();
  await admin.getByLabel("Published").click();
  await admin.getByRole("button", { name: "Save", exact: true }).click(); await admin.getByText("Saved.").waitFor();
});
await step("student: Start Test → answer → timer → autosave → submit confirm → result", async () => {
  await stu.goto("/subject/" + subj.code.toLowerCase() + "?tab=tests");
  await stu.getByRole("link", { name: "Start test" }).click();
  await stu.getByRole("button", { name: "Start test" }).click();
  await stu.getByRole("timer").waitFor();
  await stu.getByRole("radio", { name: /Bravo/ }).click();            // Q1: correct (1 pt)
  await stu.getByText("Draft saved").waitFor({ timeout: 8000 });
  await stu.getByRole("button", { name: "Next" }).click();
  await stu.getByRole("radio", { name: /Alpha/ }).click();            // Q2: wrong (3 pts)
  await stu.getByRole("button", { name: "Submit test" }).first().click();
  await stu.getByRole("heading", { name: "Submit your test?" }).waitFor();
  await stu.getByRole("button", { name: "Submit now" }).click();
  await stu.waitForURL(/\/result\?attempt=/);
  await stu.getByRole("heading", { name: "Test completed!" }).waitFor();
});
await step("result: points-based score, fail state, explanation, review", async () => {
  await stu.getByText("1 / 4").first().waitFor();          // 1 of 4 points
  await stu.getByText("25%").first().waitFor();
  await stu.getByText("Not passed this time").waitFor();
  await stu.getByText(/Bravo is correct because smoke question 2/).waitFor();
  await stu.getByText("Correct answer").first().waitFor();
  await stu.getByText("Incorrect").first().waitFor();
});
await step("retake creates a new attempt; refresh keeps progress", async () => {
  await stu.getByRole("link", { name: "Retake test" }).click();
  await stu.getByRole("button", { name: "Start test" }).click();
  await stu.getByRole("timer").waitFor();
  await stu.getByRole("radio", { name: /Bravo/ }).click(); await stu.getByText("Draft saved").waitFor({ timeout: 8000 });
  await stu.reload(); await stu.getByRole("timer").waitFor();
  assert(await stu.getByRole("radio", { name: /Bravo/ }).getAttribute("aria-checked") === "true", "draft not restored after reload");
});
await step("leave-test confirmation dialog", async () => {
  await stu.getByRole("button", { name: "Exit test" }).click();
  await stu.getByRole("heading", { name: "Leave this test?" }).waitFor();
  await stu.getByRole("button", { name: "Stay in test" }).click();
});
await step("dashboard reflects real progress/results/activity", async () => {
  await stu.goto("/dashboard");
  await stu.getByText("Recent test results").waitFor();
  await stu.getByText(testTitle).first().waitFor();
  await stu.goto("/progress"); await stu.getByText(testTitle).first().waitFor();
});

// =============== ADMIN: soft delete, students ===============
await step("admin: archive test → hidden for students, restorable", async () => {
  await admin.goto("/admin/tests");
  await admin.getByRole("button", { name: new RegExp(`^Archive: ${testTitle}`) }).click();
  await admin.getByRole("button", { name: "Archive", exact: true }).click();
  await admin.getByText(/Record archived/).waitFor();
  await stu.goto("/subject/" + subj.code.toLowerCase() + "?tab=tests"); await stu.getByText("No tests are available for this subject yet.").waitFor();
  await admin.getByLabel("Show archived").check();
  await admin.getByRole("button", { name: new RegExp(`^Restore: ${testTitle}`) }).click();
  await admin.getByText("Record restored.").waitFor();
});
await step("admin: suspend student → cannot sign in", async () => {
  await admin.goto("/admin/students");
  await admin.locator("#admin-search").fill(email);
  await admin.getByRole("button", { name: /^Edit: Smoke Tester/ }).click();
  await admin.locator("#f-status").selectOption("suspended");
  await admin.getByRole("button", { name: "Save", exact: true }).click(); await admin.getByText("Saved.").waitFor();
  await stu.goto("/dashboard"); await stu.waitForURL(/\/login/);
  await login(stu, email, pass2); await stu.getByText("This account is suspended. Contact an administrator.").waitFor();
});
await step("admin cannot demote/archive themselves", async () => {
  await admin.goto("/admin/students");
  await admin.locator("#admin-search").fill("admin@example.com");
  await admin.getByRole("button", { name: /^Edit: Demo Admin/ }).click();
  await admin.locator("#f-role").selectOption("STUDENT");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByText(/cannot change your own role/).first().waitFor();
});

// =============== ROLES: only STUDENT and ADMIN ===============
await step("teacher account and button are gone; only Demo Student / Demo Admin; role selector = Student/Admin", async () => {
  const tc = await ctx(); const t = await tc.newPage();
  await t.goto("/login");
  assert(await t.getByRole("button", { name: "Teacher", exact: true }).count() === 0, "Teacher demo button present");
  assert(await t.getByRole("button", { name: "Student", exact: true }).count() === 1 && await t.getByRole("button", { name: "Admin", exact: true }).count() === 1, "demo buttons");
  assert(!/teacher/i.test(await t.content()), "teacher text on login");
  await login(t, "teacher@example.com", "Teacher-Demo1"); await t.getByText("Incorrect email or password").first().waitFor();
  await tc.close();
});

// =============== THEME + LANGUAGE ===============
await step("theme: dark persists after reload, no flash (class on first HTML)", async () => {
  const dc = await ctx(); const d = await dc.newPage();
  await d.goto("/");
  await d.getByRole("button", { name: "Theme" }).click(); await d.getByRole("menuitemradio", { name: "Dark" }).click();
  assert(await d.evaluate(() => document.documentElement.classList.contains("dark")), "dark not applied");
  const html = await (await d.request.get("/")).text();
  assert(/<html[^>]*class="dark"/.test(html), "server HTML missing dark class (flash risk)");
  await d.reload(); assert(await d.evaluate(() => document.documentElement.classList.contains("dark")), "dark lost on reload");
  await d.getByRole("button", { name: "Theme" }).click(); await d.getByRole("menuitemradio", { name: "System" }).click();
  await dc.close();
});
await step("theme: system follows OS preference before paint", async () => {
  const dc = await ctx({ colorScheme: "dark" }); const d = await dc.newPage();
  await d.goto("/login"); assert(await d.evaluate(() => document.documentElement.classList.contains("dark")), "system dark not applied");
  await dc.close();
  const lc = await ctx({ colorScheme: "light" }); const l = await lc.newPage();
  await l.goto("/login"); assert(!(await l.evaluate(() => document.documentElement.classList.contains("dark"))), "system light wrongly dark");
  await lc.close();
});
for (const [loc, needle] of [["ru", "Войти"], ["uz", "Kirish"]]) {
  await step(`language ${loc}: login + admin + student pages have translated UI`, async () => {
    const lc = await ctx({ locale: loc }); const p = await lc.newPage();
    await p.goto("/login"); await p.getByRole("button", { name: needle, exact: true }).waitFor();
    await login(p, "admin@example.com", "Admin-Demo1", needle); await p.waitForURL(/\/admin$/);
    for (const path of ["/admin/subjects", "/admin/question-bank", "/admin/tests", "/admin/students", "/dashboard", "/courses", "/notifications"]) {
      await p.goto(path);
      const text = await p.locator("body").innerText();
      assert(!/MISSING_MESSAGE|\b(admin|common|auth)\.[a-z]+\./i.test(text), `raw key on ${path}`);
    }
    await lc.close();
  });
}
await step("language switch persists (cookie) after reload", async () => {
  const lc = await ctx(); const p = await lc.newPage(); await p.goto("/");
  await p.getByRole("button", { name: "Language" }).click(); await p.getByRole("menuitemradio", { name: "Русский" }).click();
  await p.waitForFunction(() => document.documentElement.lang === "ru"); await p.reload();
  assert((await p.evaluate(() => document.documentElement.lang)) === "ru", "lang lost"); await lc.close();
});

await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (failed.length) { console.log("FAILED:\n" + failed.map((f) => ` - ${f[0]}: ${f[2]}`).join("\n")); process.exit(1); }
