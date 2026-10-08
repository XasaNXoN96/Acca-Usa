// Runtime i18n crawl: every key page and dialog in EN / RU / UZ must show NO text from another language's dictionary
// (= no untranslated fallback or hard-coded string), no raw ICU placeholders, no message keys, no MISSING_MESSAGE.
//   BASE_URL=... CHROMIUM=... node scripts/smoke-i18n.mjs   (fresh server, after `npm run build`)
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const LOCALES = ["en", "ru", "uz"];
const load = (l) => JSON.parse(readFileSync(`src/i18n/messages/${l}.json`, "utf8"));
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)]]));
const dict = Object.fromEntries(LOCALES.map((l) => [l, new Map(flat(load(l)))]));

// Strings of OTHER languages that must never appear on a page of language L.
function foreignStrings(L) {
  const own = new Set(dict[L].values()); const out = new Map();
  for (const M of LOCALES) {
    if (M === L) continue;
    for (const [key, raw] of dict[M]) {
      const lit = raw.split(/\{[^}]*\}|#/)[0].replace(/[“”"«»]/g, "").trim(); // text before the first placeholder
      if (lit.length < 10 || !/\p{L}{3}/u.test(lit) || own.has(raw)) continue;
      if ([...dict[L].values()].some((v) => v.includes(lit))) continue; // the same wording is legitimate in this language too
      out.set(lit, `${M}:${key}`);
    }
  }
  return out;
}
const foreign = Object.fromEntries(LOCALES.map((l) => [l, foreignStrings(l)]));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let problems = 0, checks = 0;
const T1 = "bt-business-organisations-and-their-stakeholders";

async function login(who) {
  const c = await browser.newContext({ baseURL: BASE }); const p = await c.newPage(); await p.goto("/login");
  await p.getByRole("button", { name: who, exact: true }).click(); await p.getByRole("button", { name: "Sign in", exact: true }).click(); await p.waitForURL(who === "Admin" ? /admin$/ : /dashboard$/);
  const s = await c.storageState(); await c.close(); return s;
}
const states = { guest: undefined, student: await login("Student"), admin: await login("Admin") };

async function inspect(p, L, label) {
  checks++;
  const text = await p.evaluate(() => document.body.innerText);
  const issues = [];
  for (const [lit, where] of foreign[L]) if (text.includes(lit)) issues.push(`foreign text "${lit.slice(0, 50)}" (${where})`);
  if (/MISSING_MESSAGE|\{[a-zA-Z]+\}|\{[a-zA-Z]+, (plural|select)/.test(text)) issues.push("raw ICU / missing message marker");
  const keyLike = text.match(/\b(?:common|nav|admin|dashboard|subject|topic|test|result|material|ranking|certificates|notificationsPage)\.[a-zA-Z]+(?:\.[a-zA-Z]+)*\b/g);
  if (keyLike) issues.push(`message key shown: ${keyLike[0]}`);
  if (issues.length) { problems++; console.log(`✗ ${L} · ${label}: ${[...new Set(issues)].slice(0, 4).join("; ")}`); }
}

const scenes = [
  ["guest", async (p) => [["home", async () => p.goto("/")], ["all-courses", async () => p.goto("/all-courses")], ["acca", async () => p.goto("/acca")], ["fia", async () => p.goto("/fia")], ["books", async () => p.goto("/books")], ["forums", async () => p.goto("/forums")], ["search", async () => p.goto("/search?q=cost")], ["login", async () => p.goto("/login")], ["register", async () => p.goto("/register")], ["forgot", async () => p.goto("/forgot-password")],
    ["subject outline", async () => p.goto("/subject/bt")], ["locked modal", async () => { await p.goto("/subject/bt"); await p.locator("[data-topic-row] button").first().click(); await p.waitForTimeout(300); await p.locator("[data-material-row] button").first().click(); await p.getByRole("dialog").waitFor(); }], ["404", async () => p.goto("/nope-not-here")]]],
  ["student", async (p) => [["dashboard", async () => p.goto("/dashboard")], ["my platforms", async () => p.goto("/courses")], ["platform", async () => p.goto("/platform/acca")], ["subject (student)", async () => p.goto("/subject/bt")], ["topic", async () => p.goto(`/subject/bt/topic/${T1}`)], ["material text", async () => p.goto(`/subject/bt/topic/${T1}/material/${T1}-notes`)], ["material video", async () => p.goto(`/subject/bt/topic/${T1}/material/${T1}-video`)], ["material file", async () => p.goto(`/subject/bt/topic/${T1}/material/${T1}-glossary`)],
    ["exams", async () => p.goto("/exams")], ["progress", async () => p.goto("/progress")], ["ranking", async () => p.goto("/ranking")], ["certificates", async () => p.goto("/certificates")], ["certificate", async () => p.goto("/certificates/cert-demo-bt")], ["notifications", async () => p.goto("/notifications")], ["payments", async () => p.goto("/payments")], ["profile", async () => p.goto("/profile")],
    ["test intro", async () => p.goto("/test/bt-stakeholders-test")], ["test player", async () => { await p.goto("/test/bt-stakeholders-test"); if (await p.locator("[data-start-test]").count()) await p.locator("[data-start-test]").click(); await p.locator("[data-exit-test]").waitFor(); await p.waitForTimeout(400); }],
    ["exit dialog", async () => { await p.locator("[data-exit-test]").click(); await p.getByRole("dialog").waitFor(); }], ["result", async () => { await p.goto("/test/bt-stakeholders-test"); if (await p.locator("[data-start-test]").count()) { await p.locator("[data-start-test]").click(); await p.locator("[data-exit-test]").waitFor(); } await p.locator("[data-submit-test]").first().click(); await p.locator("[data-confirm-submit]").click(); await p.waitForURL(/result/); }]]],
  ["admin", async (p) => [["overview", async () => p.goto("/admin")], ["platforms", async () => p.goto("/admin/platforms")], ["subjects", async () => p.goto("/admin/subjects")], ["topics", async () => p.goto("/admin/topics")], ["materials", async () => p.goto("/admin/materials")],
    ["question bank", async () => p.goto("/admin/question-bank")], ["question form", async () => { await p.goto("/admin/question-bank"); await p.locator("main button").filter({ hasText: /^(Add question|Добавить вопрос|Savol qo)/ }).first().click(); await p.getByRole("dialog").waitFor(); }], ["question preview", async () => { await p.goto("/admin/question-bank"); await p.locator("button[aria-label^='Preview'], button[aria-label^='Предпросмотр'], button[aria-label^='Ko']").first().click(); await p.getByRole("dialog").waitFor(); }],
    ["tests", async () => p.goto("/admin/tests")], ["test form", async () => { await p.goto("/admin/tests"); await p.locator("main button").filter({ hasText: /^(Add test|Добавить тест|Test qo)/ }).first().click(); await p.getByRole("dialog").waitFor(); }],
    ["exams", async () => p.goto("/admin/exams")], ["students", async () => p.goto("/admin/students")], ["certificates", async () => p.goto("/admin/certificates")], ["cert preview", async () => { await p.goto("/admin/certificates"); await p.locator("button[aria-label^='Preview'], button[aria-label^='Предпросмотр'], button[aria-label^='Ko']").first().click(); await p.getByRole("dialog").waitFor(); }],
    ["payments", async () => p.goto("/admin/payments")], ["statistics", async () => p.goto("/admin/statistics")], ["notifications", async () => p.goto("/admin/notifications")], ["settings", async () => p.goto("/admin/settings")]]],
];

for (const L of LOCALES) {
  for (const [role, build] of scenes) {
    const c = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 }, storageState: states[role] }); await c.addCookies([{ name: "NEXT_LOCALE", value: L, url: BASE }]); const p = await c.newPage(); p.on("dialog", (d) => d.accept()); // the test's leave guard asks before navigating away
    for (const [label, go] of await build(p)) { try { await go(); await p.waitForTimeout(250); await inspect(p, L, `${role} · ${label}`); } catch (e) { problems++; console.log(`✗ ${L} · ${role} · ${label}: could not render (${String(e.message).split("\n")[0]})`); } }
    await c.close();
  }
}
await browser.close();
console.log(`\ni18n crawl: ${checks} page states × ${LOCALES.length} locales checked, ${problems} problems`);
process.exit(problems ? 1 : 0);
