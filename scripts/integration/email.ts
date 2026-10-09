/**
 * E-mail templates (EN / RU / UZ), escaping, and the SMTP provider's guards (fake transport — nothing is sent).
 *   npm run test:email
 */
import assert from "node:assert/strict";
import { renderEmail } from "../../src/services/email/templates";
import { SmtpEmailProvider } from "../../src/services/email/smtp-provider";
import { DemoEmailProvider, demoOutbox } from "../../src/services/email/demo-provider";
import type { EmailKind } from "../../src/services/email/contracts";

const evil = `<script>alert(1)</script>"><img src=x onerror=alert(2)>`;
const kinds: EmailKind[] = [
  { kind: "welcome", name: evil },
  { kind: "passwordReset", name: evil, resetUrl: "https://acca.example/reset-password?token=abc", expiresMinutes: 30 },
  { kind: "certificateIssued", name: evil, certificateTitle: evil, number: "AU-2026-000001", certificateUrl: "https://acca.example/certificates/c1", verifyUrl: "https://acca.example/verify/certificate/AU-2026-000001" },
  { kind: "notification", name: evil, title: evil, body: evil, url: "javascript:alert(1)" },
  { kind: "paymentConfirmation", name: evil, description: evil, amount: "$149.00", paymentId: "pay_1" },
  { kind: "paymentFailed", name: evil, description: evil, retryUrl: "https://acca.example/payments" },
];

async function main() {
  const subjects = new Map<string, Set<string>>();
  for (const locale of ["en", "ru", "uz"] as const) {
    for (const mail of kinds) {
      const m = await renderEmail({ email: "learner@example.com", locale }, mail);
      assert.equal(m.to, "learner@example.com");
      assert.ok(m.subject.length > 3 && !m.subject.includes("{"), `${locale}/${mail.kind}: subject resolved (${m.subject})`);
      assert.ok(!/\{[a-zA-Z]+\}/.test(m.text), `${locale}/${mail.kind}: no unresolved placeholders in text`);
      assert.ok(!m.html.includes("<script") && !m.html.includes("<img"), `${locale}/${mail.kind}: HTML-escaped`);
      assert.ok(!/href="javascript:/i.test(m.html), `${locale}/${mail.kind}: no javascript: links`);
      assert.ok(m.html.includes("ACCA") && m.text.length > 20);
      assert.ok(!/CIMA|Teacher/i.test(m.html + m.text), "brand rules");
      if (mail.kind !== "notification") (subjects.get(mail.kind) ?? subjects.set(mail.kind, new Set()).get(mail.kind)!).add(m.subject);
    }
  }
  for (const [kind, set] of subjects) assert.equal(set.size, 3, `${kind}: three different language versions`);
  const ru = await renderEmail({ email: "a@b.co", locale: "ru" }, kinds[1]!);
  assert.match(ru.subject, /пароля/);
  assert.ok(ru.text.includes("https://acca.example/reset-password?token=abc") && ru.html.includes('href="https://acca.example/reset-password?token=abc"'));

  const demo = new DemoEmailProvider();
  demoOutbox.clear();
  assert.deepEqual(await demo.send({ to: "x@y.zz", subject: "s", text: "t", html: "h" }), { ok: true });
  assert.equal(demoOutbox.all().length, 1, "demo provider only records");

  const sent: Record<string, unknown>[] = [];
  const smtp = new SmtpEmailProvider({ sendMail: (async (o: Record<string, unknown>) => { sent.push(o); return { messageId: "<id@x>" }; }) as never });
  process.env.EMAIL_FROM = "ACCA USA <no-reply@acca.example>";
  assert.deepEqual(await smtp.send({ to: "a@b.co\r\nBcc: evil@x.co", subject: "s", text: "t", html: "h" }), { ok: false, reason: "INVALID_RECIPIENT" });
  assert.deepEqual(await smtp.send({ to: "a@b.co, c@d.co", subject: "s", text: "t", html: "h" }), { ok: false, reason: "INVALID_RECIPIENT" });
  assert.equal(sent.length, 0, "rejected recipients are never handed to the transport");
  const ok = await smtp.send({ to: "a@b.co", subject: "line1\r\nBcc: evil@x.co", text: "t", html: "h" });
  assert.equal(ok.ok, true);
  assert.equal(String(sent[0]?.subject).includes("\n"), false, "subject header injection stripped");
  const failing = new SmtpEmailProvider({ sendMail: (async () => { throw new Error("boom: secret-password"); }) as never });
  assert.deepEqual(await failing.send({ to: "a@b.co", subject: "s", text: "t", html: "h" }), { ok: false, reason: "PROVIDER_ERROR", code: "UNKNOWN" }, "transport errors never throw");

  // ── failure classes (codes only), bounded retry of transient errors, no retry of permanent ones, secrets never in the result
  const { classifySmtpError } = await import("../../src/services/email/classify");
  const cls = (e: object) => classifySmtpError(e);
  assert.deepEqual(cls({ code: "EAUTH", responseCode: 535 }), { code: "AUTH", transient: false });
  assert.deepEqual(cls({ code: "ECONNREFUSED" }), { code: "CONNECTION", transient: true });
  assert.deepEqual(cls({ code: "ETIMEDOUT" }), { code: "TIMEOUT", transient: true });
  assert.deepEqual(cls({ responseCode: 451 }), { code: "TEMPORARY", transient: true });
  assert.deepEqual(cls({ code: "EENVELOPE", responseCode: 550 }), { code: "REJECTED_RECIPIENT", transient: false });
  assert.deepEqual(cls({ responseCode: 554 }), { code: "REJECTED_MESSAGE", transient: false });
  assert.deepEqual(cls(new Error("secret-password")), { code: "UNKNOWN", transient: false });
  const attempts = { n: 0 };
  const flaky = new SmtpEmailProvider({ sendMail: (async () => { attempts.n += 1; if (attempts.n < 2) throw Object.assign(new Error("down"), { code: "ECONNREFUSED" }); return { messageId: "<ok@x>" }; }) as never }, [1]);
  assert.equal((await flaky.send({ to: "a@b.co", subject: "s", text: "t", html: "h" })).ok, true, "a transient failure is retried once and then succeeds"); assert.equal(attempts.n, 2);
  const down = { n: 0 };
  const dead = new SmtpEmailProvider({ sendMail: (async () => { down.n += 1; throw Object.assign(new Error("password=hunter2"), { code: "ECONNREFUSED" }); }) as never }, [1]);
  const r1 = await dead.send({ to: "a@b.co", subject: "s", text: "t", html: "h" });
  assert.deepEqual(r1, { ok: false, reason: "PROVIDER_ERROR", code: "CONNECTION" }); assert.equal(down.n, 2, "exactly one retry"); assert.ok(!JSON.stringify(r1).includes("hunter2"), "raw error text leaked into the result");
  const auth = { n: 0 };
  const badLogin = new SmtpEmailProvider({ sendMail: (async () => { auth.n += 1; throw Object.assign(new Error("535 bad credentials for u/p"), { code: "EAUTH", responseCode: 535 }); }) as never }, [1, 1]);
  assert.deepEqual(await badLogin.send({ to: "a@b.co", subject: "s", text: "t", html: "h" }), { ok: false, reason: "PROVIDER_ERROR", code: "AUTH" }); assert.equal(auth.n, 1, "a permanent failure is not retried");

  // ── the test message renders in all languages, escaped
  for (const locale of ["en", "ru", "uz"] as const) {
    const m = await renderEmail({ email: "a@b.co", locale }, { kind: "test", name: evil });
    assert.ok(m.subject.length > 5 && !m.html.includes("<script") && !/\{[a-zA-Z]+\}/.test(m.text), `${locale}/test`);
  }
  // ── delivery counters: real outcomes only
  const { recordEmailOutcome, emailStats, resetEmailStats } = await import("../../src/services/email/health");
  resetEmailStats(); assert.deepEqual(emailStats(), { sent: 0, failed: 0 });
  recordEmailOutcome(true); recordEmailOutcome(false, "AUTH"); recordEmailOutcome(false, "CONNECTION");
  const st = emailStats(); assert.ok(st.sent === 1 && st.failed === 2 && st.lastFailCode === "CONNECTION" && st.lastOkAt && st.lastFailAt, JSON.stringify(st));
  console.log("email: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
