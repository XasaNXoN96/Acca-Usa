import type { Metadata } from "next";
import { Mail, Send } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { SupportForm } from "@/features/support/support-form";
import { sessionOrNull } from "@/lib/auth/guards";
import { legalOperator } from "@/lib/legal/operator";
import { telegramConfigured } from "@/services/telegram/client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("support"))("title") };
}

/** Public support page: the team's Telegram contact, e-mail and a message form that is delivered to the team's Telegram chat. */
export default async function SupportPage() {
  const t = await getTranslations("support");
  const session = await sessionOrNull();
  const handle = process.env.SUPPORT_TELEGRAM;
  const email = legalOperator().contactEmail;
  const formAvailable = telegramConfigured();
  return (
    <div className="container-page max-w-3xl space-y-8 py-10 md:py-14">
      <div className="space-y-2">
        <h1 className="type-h1">{t("title")}</h1>
        <p className="type-body text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {handle ? (
          <a href={`https://t.me/${handle}`} target="_blank" rel="noopener noreferrer" data-support-telegram
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Send className="size-5" aria-hidden /></span>
            <span className="min-w-0"><span className="block font-semibold">{t("telegram")}</span><span className="type-small block break-all text-primary">@{handle}</span><span className="type-caption text-muted-foreground">{t("telegramHint")}</span></span>
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}`} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Mail className="size-5" aria-hidden /></span>
            <span className="min-w-0"><span className="block font-semibold">{t("emailTitle")}</span><span className="type-small block break-all text-primary">{email}</span><span className="type-caption text-muted-foreground">{t("emailHint2")}</span></span>
          </a>
        ) : null}
      </div>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="sp-form-title">
        <h2 id="sp-form-title" className="type-h3">{t("formTitle")}</h2>
        {formAvailable ? <SupportForm defaultName={session?.user.name ?? ""} defaultEmail={session?.user.email ?? ""} /> : <Alert variant="info">{t("formUnavailable")}</Alert>}
      </section>
    </div>
  );
}
