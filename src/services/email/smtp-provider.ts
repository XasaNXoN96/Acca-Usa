import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { classifySmtpError } from "./classify";
import type { EmailMessage, EmailProvider, EmailResult } from "./contracts";

const ADDRESS_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** Production delivery over SMTP (any vendor). Credentials come from the environment; nothing is logged but the outcome. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp" as const;
  private transporter: Transporter | null = null;

  constructor(private readonly transport?: Pick<Transporter, "sendMail">, private readonly retryDelaysMs: number[] = [600]) {}

  private get client(): Pick<Transporter, "sendMail"> {
    if (this.transport) return this.transport;
    const c = serverEnv.smtp();
    return (this.transporter ??= nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.password },
      // A slow mail server must never hang a request for minutes (nodemailer defaults are 2 min).
      connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 15_000,
    }));
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    // Header-injection guard: one plain address, no control characters.
    if (!ADDRESS_RE.test(message.to) || message.to.length > 254) return { ok: false, reason: "INVALID_RECIPIENT" };
    // Transient failures (connection, timeout, 4xx) are retried a bounded number of times; permanent ones (auth, rejected) are not.
    for (let attempt = 0; ; attempt++) {
      try {
        const info = await this.client.sendMail({ from: serverEnv.smtp().from, to: message.to, subject: message.subject.replace(/[\r\n]+/g, " "), text: message.text, html: message.html });
        return { ok: true, id: typeof info.messageId === "string" ? info.messageId : undefined };
      } catch (e) {
        const { code, transient } = classifySmtpError(e);
        const delay = this.retryDelaysMs[attempt];
        if (transient && delay !== undefined) { await new Promise((r) => setTimeout(r, delay)); continue; }
        logEvent("error", "email.send_failed", { provider: "smtp", failure: code, attempts: attempt + 1 }); // the code only — never the error text
        return { ok: false, reason: "PROVIDER_ERROR", code };
      }
    }
  }
}
