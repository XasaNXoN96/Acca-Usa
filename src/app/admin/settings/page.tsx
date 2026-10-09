import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { ErrorState } from "@/components/ui/states";
import { SettingsForm } from "@/features/admin/settings-form";
import { can } from "@/lib/permissions";
import { isDemoMode } from "@/lib/app-mode";
import { Alert } from "@/components/ui/alert";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { SendTestEmailButton } from "@/features/admin/email-card";
import { emailStats } from "@/services/email/health";
import { getEmailProvider } from "@/services/email";
import { serverEnv } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.settings"))("title") };
}

export default async function SettingsPage() {
  const [t, s, session] = await Promise.all([getTranslations("admin.settings"), getTranslations("states"), requireSession(STAFF_ROLES)]);
  if (!can(session.user.role, "manage_settings")) {
    return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<DemoBadge />} />
      {isDemoMode ? <SettingsForm /> : <Alert variant="info"><div><p className="font-semibold">{t("liveTitle")}</p><p>{t("liveText")}</p></div></Alert>}
      <section aria-labelledby="email-card" className="mt-6 space-y-3 rounded-xl border border-border p-5" data-email-card>
        <h2 id="email-card" className="type-h3">{t("email.title")}</h2>
        <EmailStatus t={t} />
        <SendTestEmailButton />
        <p className="type-caption max-w-3xl text-muted-foreground">{t("email.note")}</p>
      </section>
    </>
  );
}

/** Provider, SMTP host and sender (never the user / password) and this instance's real delivery counters. */
function EmailStatus({ t }: { t: Awaited<ReturnType<typeof getTranslations<"admin.settings">>> }) {
  const provider = getEmailProvider().name;
  const smtp = serverEnv.smtp();
  const s = emailStats();
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]" data-email-status={provider}>
      <dt className="text-muted-foreground">{t("email.provider")}</dt>
      <dd>{provider === "smtp" ? t("email.smtp") : t("email.demo")}</dd>
      {provider === "smtp" ? (
        <>
          <dt className="text-muted-foreground">{t("email.host")}</dt>
          <dd>{smtp.host ? `${smtp.host}:${smtp.port}` : t("email.notConfigured")}</dd>
          <dt className="text-muted-foreground">{t("email.from")}</dt>
          <dd className="[overflow-wrap:anywhere]">{smtp.from || "—"}</dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">{t("email.stats")}</dt>
      <dd data-email-counters>
        {s.sent + s.failed === 0 ? t("email.none") : <>{t("email.sent", { count: s.sent })} · {t("email.failed", { count: s.failed })}{s.lastFailCode ? <span className="block text-destructive">{t("email.lastFail", { code: codeLabel(t, s.lastFailCode), time: s.lastFailAt ?? "" })}</span> : null}</>}
      </dd>
    </dl>
  );
}

const CODES = ["AUTH", "CONNECTION", "TIMEOUT", "TEMPORARY", "REJECTED_RECIPIENT", "REJECTED_MESSAGE", "UNKNOWN", "INVALID_RECIPIENT", "RENDER", "PROVIDER_ERROR"];
const codeLabel = (t: unknown, c: string) => (CODES.includes(c) ? (t as (k: string) => string)(`email.codes.${c}`) : c);
