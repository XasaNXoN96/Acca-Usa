import "server-only";
import { createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";
import type { EmailKind, EmailMessage, Recipient } from "./contracts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Only http(s) links are ever put into an href (no javascript: URLs), and the value is attribute-escaped. */
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? esc(u) : "#");

function layout(opts: { preheader: string; heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer: string; brand: string }): string {
  const button = opts.cta
    ? `<p style="margin:28px 0"><a href="${safeUrl(opts.cta.url)}" style="background:#0f1d3a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${esc(opts.cta.label)}</a></p><p style="font-size:12px;color:#4b5a78;word-break:break-all">${esc(opts.cta.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f1d3a"><span style="display:none">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:32px">
<tr><td><p style="font-size:20px;font-weight:800;margin:0 0 20px">ACCA <span style="color:#c8102e">USA</span></p>
<h1 style="font-size:20px;margin:0 0 16px">${esc(opts.heading)}</h1>
${opts.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${esc(p)}</p>`).join("")}${button}
<hr style="border:none;border-top:1px solid #d8deea;margin:24px 0"><p style="font-size:12px;color:#4b5a78;margin:0">${esc(opts.footer)} — ${esc(opts.brand)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

const catalogues = { en, ru, uz } as const;

/** Renders one e-mail in the recipient's language (RU / EN / UZ from `email.*`). All dynamic values are escaped. */
export async function renderEmail(to: Recipient, mail: EmailKind): Promise<EmailMessage> {
  // createTranslator needs no request context, so e-mails can be rendered from webhooks and background jobs too.
  const t = createTranslator({ locale: to.locale, messages: catalogues[to.locale] ?? en, namespace: "email" });
  const common = { footer: t("footer"), brand: "ACCA USA" };
  const text = (parts: (string | undefined)[]) => parts.filter(Boolean).join("\n\n");

  switch (mail.kind) {
    case "welcome": {
      const paragraphs = [t("welcome.hello", { name: mail.name }), t("welcome.body")];
      return { to: to.email, subject: t("welcome.subject"), text: text([...paragraphs, t("footer")]), html: layout({ preheader: t("welcome.subject"), heading: t("welcome.subject"), paragraphs, ...common }) };
    }
    case "passwordReset": {
      const paragraphs = [t("reset.hello", { name: mail.name }), t("reset.body", { minutes: mail.expiresMinutes }), t("reset.ignore")];
      return { to: to.email, subject: t("reset.subject"), text: text([...paragraphs, mail.resetUrl, t("footer")]), html: layout({ preheader: t("reset.subject"), heading: t("reset.subject"), paragraphs, cta: { label: t("reset.cta"), url: mail.resetUrl }, ...common }) };
    }
    case "certificateIssued": {
      const paragraphs = [t("certificate.hello", { name: mail.name }), t("certificate.body", { title: mail.certificateTitle }), t("certificate.number", { number: mail.number }), t("certificate.verify", { url: mail.verifyUrl })];
      return { to: to.email, subject: t("certificate.subject"), text: text([...paragraphs, mail.certificateUrl, t("footer")]), html: layout({ preheader: t("certificate.subject"), heading: t("certificate.subject"), paragraphs, cta: { label: t("certificate.cta"), url: mail.certificateUrl }, ...common }) };
    }
    case "notification": {
      const paragraphs = [t("notification.hello", { name: mail.name }), mail.body];
      return { to: to.email, subject: mail.title, text: text([...paragraphs, mail.url, t("footer")]), html: layout({ preheader: mail.title, heading: mail.title, paragraphs, cta: mail.url ? { label: t("notification.cta"), url: mail.url } : undefined, ...common }) };
    }
    case "paymentConfirmation": {
      const paragraphs = [t("paymentOk.hello", { name: mail.name }), t("paymentOk.body", { description: mail.description, amount: mail.amount }), t("paymentOk.reference", { id: mail.paymentId })];
      return { to: to.email, subject: t("paymentOk.subject"), text: text([...paragraphs, t("footer")]), html: layout({ preheader: t("paymentOk.subject"), heading: t("paymentOk.subject"), paragraphs, ...common }) };
    }
    case "paymentFailed": {
      const paragraphs = [t("paymentFailed.hello", { name: mail.name }), t("paymentFailed.body", { description: mail.description }), t("paymentFailed.hint")];
      return { to: to.email, subject: t("paymentFailed.subject"), text: text([...paragraphs, mail.retryUrl, t("footer")]), html: layout({ preheader: t("paymentFailed.subject"), heading: t("paymentFailed.subject"), paragraphs, cta: { label: t("paymentFailed.cta"), url: mail.retryUrl }, ...common }) };
    }
  }
}
