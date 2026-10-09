import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { services } from "@/services";
import { otpauthUri } from "@/lib/auth/totp";
import type { User } from "@/types";
import { MfaConfirmForm } from "./mfa-confirm-form";

/** Server component: the secret is generated and rendered on the server, only for the signed-in administrator, never cached. */
export async function MfaSetup({ user, required }: { user: User; required: boolean }) {
  const t = await getTranslations("admin.security");
  const status = await services.mfa.status(user.id);

  if (status.enabled) {
    return (
      <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-labelledby="mfa-on">
        <h2 id="mfa-on" className="type-h3">{t("enabledTitle")}</h2>
        <Alert variant="success">{t("enabledText")}</Alert>
        <p className="type-small text-muted-foreground">{t("recoveryLeft", { count: status.recoveryCodesLeft })}</p>
        <p className="type-small text-muted-foreground">{t("lostDevice")}</p>
      </section>
    );
  }

  const begin = await services.mfa.beginEnrollment(user.id);
  if (!begin.ok) return <Alert variant="destructive">{t("failed")}</Alert>;
  const uri = otpauthUri("ACCA USA", user.email, begin.data.secret);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="mfa-setup">
      <h2 id="mfa-setup" className="type-h3">{t("setupTitle")}</h2>
      {required ? <Alert variant="warning">{t("required")}</Alert> : null}
      <div className="type-small space-y-1 text-muted-foreground">
        {(["step1", "step2", "step3"] as const).map((k, i) => <p key={k}><span className="font-semibold text-foreground">{i + 1}.</span> {t(k)}</p>)}
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL generated on the server */}
        <img src={qr} width={220} height={220} alt={t("qrAlt")} className="rounded-lg border border-border bg-white p-1" />
        <div className="space-y-1">
          <p className="type-caption text-muted-foreground">{t("manualKey")}</p>
          <code className="type-small block break-all rounded bg-muted px-2 py-1 font-mono" data-testid="mfa-secret">{begin.data.secret}</code>
        </div>
      </div>
      <MfaConfirmForm />
    </section>
  );
}
