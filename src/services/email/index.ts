import "server-only";
import { getLocale } from "next-intl/server";
import { APP_MODE } from "@/lib/app-mode";
import { serverEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";
import type { EmailKind, EmailProvider, EmailResult, Recipient } from "./contracts";
import { DemoEmailProvider } from "./demo-provider";
import { SmtpEmailProvider } from "./smtp-provider";
import { recordEmailOutcome } from "./health";
import { renderEmail } from "./templates";

const g = globalThis as unknown as { __accaEmail?: EmailProvider };

/** Composition root for e-mail — the only place that knows which provider is active. */
export function getEmailProvider(): EmailProvider {
  return (g.__accaEmail ??= APP_MODE === "demo" ? new DemoEmailProvider() : new SmtpEmailProvider());
}

/**
 * Renders the template in the recipient's language and hands it to the provider. NEVER throws and never blocks the
 * business flow that triggered it (registration, payment, …): a failed delivery is logged (no content) and reported.
 */
export async function sendEmail(to: Recipient, mail: EmailKind): Promise<EmailResult> {
  try {
    const message = await renderEmail(to, mail);
    const result = await getEmailProvider().send(message);
    recordEmailOutcome(result.ok, result.ok ? undefined : (result.code ?? result.reason));
    if (!result.ok) logEvent("warn", "email.not_sent", { kind: mail.kind, reason: result.reason, failure: result.code });
    return result;
  } catch (e) {
    logEvent("error", "email.render_failed", { kind: mail.kind, error: e instanceof Error ? e.name : "unknown" });
    recordEmailOutcome(false, "RENDER");
    return { ok: false, reason: "PROVIDER_ERROR" };
  }
}

/** Absolute links in e-mails: APP_URL in production, the current origin only as a demo fallback. */
export const absoluteUrl = (path: string) => `${serverEnv.appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
export { getLocale as currentLocale };
export type { EmailKind, Recipient } from "./contracts";
