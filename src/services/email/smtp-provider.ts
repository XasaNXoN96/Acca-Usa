import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import type { EmailMessage, EmailProvider, EmailResult } from "./contracts";

const ADDRESS_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** Production delivery over SMTP (any vendor). Credentials come from the environment; nothing is logged but the outcome. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp" as const;
  private transporter: Transporter | null = null;

  constructor(private readonly transport?: Pick<Transporter, "sendMail">) {}

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
    try {
      const info = await this.client.sendMail({ from: serverEnv.smtp().from, to: message.to, subject: message.subject.replace(/[\r\n]+/g, " "), text: message.text, html: message.html });
      return { ok: true, id: typeof info.messageId === "string" ? info.messageId : undefined };
    } catch (e) {
      logEvent("error", "email.send_failed", { provider: "smtp", error: e instanceof Error ? e.name : "unknown" });
      return { ok: false, reason: "PROVIDER_ERROR" };
    }
  }
}
