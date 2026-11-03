/**
 * Telegram: notifier, bot webhook logic and the code helpers — against a local TEST DOUBLE of the Bot API (no Telegram, no token of a real bot).
 * Proves OUR side: what is sent, to whom, how it is escaped, flood / duplicate limits, that failures never throw and tokens never leak,
 * and the bot's reaction to /start <token>, /id and ordinary messages. It does NOT prove that Telegram accepts the calls.
 *   npm run test:telegram
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";

const TOKEN = "123456789:AAH_testtoken_0123456789abcdefghijkl";
process.env.TELEGRAM_BOT_TOKEN = TOKEN;
process.env.TELEGRAM_CHAT_ID = "777000";
process.env.TELEGRAM_WEBHOOK_SECRET = "hook-secret-0123456789";
process.env.TELEGRAM_BOT_USERNAME = "acca_test_bot";
process.env.APP_URL = "https://acca.example";
process.env.AUTH_SECRET = "x".repeat(48);

type Call = { method: string; body: Record<string, unknown> };
const calls: Call[] = [];
let mode: "ok" | "fail" | "slow" = "ok";
const server = createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? "");
    if (!m || m[1] !== TOKEN) { res.statusCode = 404; res.end("{}"); return; }
    calls.push({ method: m[2]!, body: JSON.parse(raw || "{}") });
    if (mode === "slow") return; // never answers
    res.setHeader("content-type", "application/json");
    if (mode === "fail") { res.statusCode = 400; res.end(JSON.stringify({ ok: false, description: "Bad Request" })); return; }
    res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
});
server.listen(47400, "127.0.0.1");

let failed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log("  ok  ", name); } catch (e) { failed++; console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 5).join("\n      ")); }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sent = () => calls.filter((c) => c.method === "sendMessage");
const texts = () => sent().map((c) => String(c.body.text));

async function main() {
  await once(server, "listening");
  process.env.TELEGRAM_API_BASE = "http://127.0.0.1:47400";
  const { notifyOps, notifyFromLog, notifyAudit, maskEmail, resetNotifyState, telegramEnabledFor } = await import("../../src/services/telegram/notify");
  const { sendTelegram, telegramConfigured } = await import("../../src/services/telegram/client");
  const { handleUpdate, secretMatches, resetWebhookState } = await import("../../src/services/telegram/webhook");
  const codes = await import("../../src/lib/auth/telegram-codes");
  const reset = () => { calls.length = 0; resetNotifyState(); resetWebhookState(); mode = "ok"; };

  await step("configured + sends one HTML message to the ops chat with title, lines, host and time; dynamic text is escaped", async () => {
    reset(); assert.ok(telegramConfigured());
    notifyOps("system", "Error <b>boom</b>", ["detail: a & b < c"]); await wait(150);
    assert.equal(sent().length, 1); const c = sent()[0]!;
    assert.equal(c.body.chat_id, "777000"); assert.equal(c.body.parse_mode, "HTML");
    const t = String(c.body.text); assert.ok(t.includes("&lt;b&gt;boom&lt;/b&gt;") && t.includes("a &amp; b &lt; c") && t.includes("acca.example") && t.includes("UTC"), t);
    assert.ok(!t.includes("<b>boom"), "unescaped markup from data");
  });

  await step("categories: TELEGRAM_EVENTS limits what is sent", async () => {
    reset(); process.env.TELEGRAM_EVENTS = "security, payments";
    notifyOps("system", "a system event"); notifyOps("security", "a security event"); notifyOps("users", "a user event"); await wait(150);
    assert.deepEqual(texts().map((t) => /security event/.test(t)), [true]); assert.ok(telegramEnabledFor("payments") && !telegramEnabledFor("content"));
    delete process.env.TELEGRAM_EVENTS;
  });

  await step("identical events inside 10 minutes are merged into one message", async () => {
    reset();
    for (let i = 0; i < 4; i++) notifyOps("system", "same problem", ["x"], "k1"); await wait(150);
    assert.equal(sent().length, 1, "duplicates must not be sent");
  });

  await step("flood protection: at most 20 messages a minute, the rest are counted", async () => {
    reset();
    for (let i = 0; i < 30; i++) notifyOps("content", `distinct event ${i}`); await wait(300);
    assert.equal(sent().length, 20, `sent ${sent().length}`);
  });

  await step("log hook: errors are reported with safe fields; ordinary warnings and telegram.* events are not", async () => {
    reset();
    notifyFromLog("error", "email.send_failed", { provider: "smtp", failure: "AUTH" });
    notifyFromLog("warn", "some.random_warning", {}); notifyFromLog("info", "x.y", {});
    notifyFromLog("error", "telegram.send_failed", { code: "NETWORK" }); // never report the reporter
    notifyFromLog("warn", "upload.virus_found", { id: "f1", signature: "Eicar" });
    notifyFromLog("error", "payment.amount_mismatch", { provider: "payme", paymentId: "p1" });
    await wait(200);
    const t = texts(); assert.equal(t.length, 3, t.join(" | "));
    assert.ok(t[0]!.includes("email.send_failed") && t[0]!.includes("failure: AUTH"));
    assert.ok(t[1]!.includes("virus_found") && t[2]!.includes("amount_mismatch"));
  });

  await step("audit hook: facts only (action, masked actor, target), payments are left to their own message", async () => {
    reset();
    notifyAudit({ actor: { type: "admin", id: "u1", email: "owner@acca.example" }, action: "auth.login", target: { type: "session" } });
    notifyAudit({ actor: { type: "admin", id: "u1", email: "owner@acca.example" }, action: "materials.create", target: { type: "materials", id: "m1" } });
    notifyAudit({ actor: { type: "system", id: "payme" }, action: "payment.paid", target: { type: "payment", id: "p1" } });
    notifyAudit({ actor: { type: "admin", id: "u1", email: "owner@acca.example" }, action: "auth.mfa_failed", outcome: "failed" });
    await wait(200); const t = texts(); assert.equal(t.length, 3, t.join(" | "));
    assert.ok(t.every((x) => !x.includes("owner@acca.example")), "full e-mail leaked"); assert.ok(t[0]!.includes("o***@acca.example") && t[2]!.includes("⚠️"));
    assert.equal(maskEmail("student@example.com"), "s***@example.com");
    process.env.TELEGRAM_PII = "full"; assert.equal(maskEmail("student@example.com"), "student@example.com"); delete process.env.TELEGRAM_PII;
  });

  await step("a Telegram outage or a refusal never throws; the token never appears in logs or errors", async () => {
    reset(); mode = "fail";
    const logged: string[] = []; const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((s: string) => { logged.push(String(s)); return true; }) as typeof process.stderr.write;
    try { assert.equal(await sendTelegram("777000", "hi"), false); assert.equal(await sendTelegram("not-a-chat", "hi"), false); } finally { process.stderr.write = orig; }
    assert.ok(logged.some((l) => l.includes("telegram.send_failed")), "failure not logged"); assert.ok(logged.every((l) => !l.includes(TOKEN) && !l.includes("AAH_")), "TOKEN IN LOG");
    mode = "ok";
    process.env.TELEGRAM_API_BASE = "http://127.0.0.1:1"; assert.equal(await sendTelegram("777000", "hi"), false, "connection refused"); process.env.TELEGRAM_API_BASE = "http://127.0.0.1:47400";
  });

  await step("not configured → nothing is sent and nothing throws", async () => {
    reset(); const t = process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_BOT_TOKEN;
    notifyOps("system", "silent"); assert.equal(await sendTelegram("777000", "x"), false); process.env.TELEGRAM_BOT_TOKEN = t; await wait(100); assert.equal(sent().length, 0);
  });

  // ── the bot
  const deps = (over: Record<string, unknown> = {}) => {
    const replies: [string, string][] = []; const forwarded: string[] = []; const linked: string[] = [];
    return {
      replies, forwarded, linked,
      d: {
        opsChatId: "777000",
        reply: async (chat: string, html: string) => { replies.push([chat, html]); },
        forwardToTeam: async (html: string) => { forwarded.push(html); },
        completeLink: async (token: string) => (token === "good-token-0123456789abcdef" ? { ok: true as const, userId: "u1", userName: "Site <Owner>" } : { ok: false as const }),
        onLinked: (i: { userName: string }) => linked.push(i.userName),
        ...over,
      },
    };
  };
  const msg = (text: string, chat = 555, type = "private", from: Record<string, unknown> = { first_name: "Ali", username: "ali_u" }) => ({ message: { text, chat: { id: chat, type }, from } });

  await step("bot: /start <token> links the chat (reply names the admin, HTML-escaped); a bad token is refused; groups cannot link", async () => {
    resetWebhookState(); const { d, replies, linked } = deps();
    await handleUpdate(msg("/start good-token-0123456789abcdef"), d); assert.ok(replies[0]![1].includes("Site &lt;Owner&gt;") && linked.length === 1);
    await handleUpdate(msg("/start wrong-token-xxxxxxxxxxxx"), d); assert.ok(replies[1]![1].includes("invalid, expired"));
    await handleUpdate(msg("/start good-token-0123456789abcdef", -100123, "group"), d); assert.equal(linked.length, 1, "a group linked an admin");
  });

  await step("bot: /start and /id answer with the chat id (how the operator finds TELEGRAM_CHAT_ID); /id@bot form works", async () => {
    resetWebhookState(); const { d, replies } = deps();
    await handleUpdate(msg("/start", 4242), d); await handleUpdate(msg("/id", -100987, "supergroup"), d); await handleUpdate(msg("/id@acca_test_bot", 5), d);
    assert.deepEqual(replies.map((r) => /<code>(-?\d+)<\/code>/.exec(r[1])?.[1]), ["4242", "-100987", "5"]);
  });

  await step("bot: a message from a visitor is forwarded to the team (escaped, with the sender), thanked once, flood-limited; the owner's own chat and bots are ignored", async () => {
    resetWebhookState(); const { d, replies, forwarded } = deps();
    await handleUpdate(msg("Hello <i>team</i>, I cannot pay"), d);
    assert.equal(forwarded.length, 1); assert.ok(forwarded[0]!.includes("Hello &lt;i&gt;team&lt;/i&gt;") && forwarded[0]!.includes("@ali_u") && forwarded[0]!.includes("<code>555</code>"));
    assert.equal(replies.length, 1);
    for (let i = 0; i < 9; i++) await handleUpdate(msg(`again ${i}`), d);
    assert.equal(forwarded.length, 5, `flood: ${forwarded.length}`); assert.equal(replies.length, 1, "thanked more than once");
    await handleUpdate(msg("owner talking", 777000), d); assert.equal(forwarded.length, 5, "the ops chat was forwarded to itself");
    await handleUpdate({ message: { text: "spam", chat: { id: 9, type: "private" }, from: { is_bot: true } } }, d); assert.equal(forwarded.length, 5);
    await handleUpdate({ message: { chat: { id: 9, type: "private" } } }, d); await handleUpdate({}, d); // no text / no message: ignored
  });

  await step("webhook secret: only the exact value passes", async () => {
    assert.ok(secretMatches("hook-secret-0123456789", "hook-secret-0123456789")); assert.ok(!secretMatches(null, "x")); assert.ok(!secretMatches("hook-secret-0123456780", "hook-secret-0123456789")); assert.ok(!secretMatches("short", "hook-secret-0123456789")); assert.ok(!secretMatches("anything", ""));
  });

  await step("codes: 6 digits, link tokens URL-safe, hashes are bound to purpose and user, comparison is exact", async () => {
    for (let i = 0; i < 200; i++) assert.match(codes.newLoginCode(), /^\d{6}$/);
    assert.match(codes.newLinkToken(), /^[A-Za-z0-9_-]{32}$/);
    const a = codes.hashTelegramSecret("login", "u1", "123456");
    assert.notEqual(a, codes.hashTelegramSecret("login", "u2", "123456")); assert.notEqual(a, codes.hashTelegramSecret("link", "u1", "123456")); assert.notEqual(a, codes.hashTelegramSecret("login", "u1", "123457"));
    assert.ok(codes.sameHash(a, codes.hashTelegramSecret("login", "u1", "123456"))); assert.ok(!codes.sameHash(a, a.slice(1)));
    assert.ok(codes.looksLikeLoginCode("012345") && !codes.looksLikeLoginCode("12345") && !codes.looksLikeLoginCode("1234567") && !codes.looksLikeLoginCode("ABCDEF"));
    assert.equal(codes.LOGIN_CODE_TTL_MS, 300_000); assert.equal(codes.MAX_CODE_ATTEMPTS, 5);
  });

  server.close();
  console.log(failed ? `\n${failed} step(s) failed` : "\nall telegram checks passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
