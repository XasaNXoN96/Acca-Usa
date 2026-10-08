import type { Locale } from "@/types";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type EmailResult = { ok: true; id?: string } | { ok: false; reason: "PROVIDER_ERROR" | "INVALID_RECIPIENT" };

/**
 * Transactional e-mail. Business code depends on this interface only.
 *  - DemoEmailProvider: sends NOTHING; keeps an in-memory outbox for tests (demo mode)
 *  - SmtpEmailProvider: real delivery over SMTP (production)
 */
export interface EmailProvider {
  readonly name: "demo" | "smtp";
  send(message: EmailMessage): Promise<EmailResult>;
}

export type EmailKind =
  | { kind: "welcome"; name: string }
  | { kind: "passwordReset"; name: string; resetUrl: string; expiresMinutes: number }
  | { kind: "certificateIssued"; name: string; certificateTitle: string; number: string; certificateUrl: string; verifyUrl: string }
  | { kind: "notification"; name: string; title: string; body: string; url?: string }
  | { kind: "paymentConfirmation"; name: string; description: string; amount: string; paymentId: string }
  | { kind: "paymentFailed"; name: string; description: string; retryUrl: string };

export interface Recipient { email: string; locale: Locale }
