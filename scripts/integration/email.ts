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
  assert.deepEqual(await failing.send({ to: "a@b.co", subject: "s", text: "t", html: "h" }), { ok: false, reason: "PROVIDER_ERROR" }, "transport errors never throw");
  console.log("email: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
