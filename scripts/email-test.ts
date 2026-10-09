/**
 * Verifies the SMTP configuration and sends ONE real test message.
 *
 *   EMAIL_TEST_TO=you@example.com npm run email:test      (SMTP_* and EMAIL_FROM come from the environment)
 *
 * Prints the outcome only — never the host credentials. "Accepted" means the SMTP server took the message; check the inbox,
 * SPF / DKIM / DMARC with the checklist in docs/EMAIL.md before calling e-mail verified.
 */
import nodemailer from "nodemailer";
import { classifySmtpError } from "../src/services/email/classify";

const to = process.env.EMAIL_TEST_TO?.trim();
const need = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"].filter((k) => !process.env[k]);
if (!to || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(to) || need.length) {
  console.error(`Set EMAIL_TEST_TO to one address${need.length ? ` and ${need.join(", ")}` : ""}.`);
  process.exit(1);
}
const port = Number(process.env.SMTP_PORT ?? 587);
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === "1",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 15_000,
});
(async () => {
  try {
    await transport.verify();
    console.log(`SMTP connection and login OK (${process.env.SMTP_HOST}:${port}).`);
    const info = await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject: "ACCA USA — SMTP test", text: "SMTP test message. If you can read this, the mail server accepted it." });
    console.log(`Accepted by the mail server (id ${String(info.messageId)}). Now check the inbox and the spam folder.`);
  } catch (e) {
    const { code } = classifySmtpError(e);
    console.error(`FAILED: ${code}`); // class only — the raw error text is not printed
    process.exit(2);
  }
})();
