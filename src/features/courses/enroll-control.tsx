import { getTranslations } from "next-intl/server";
import { legalOperator } from "@/lib/legal/operator";
import { paymentsMode } from "@/lib/payments-mode";
import { EnrollButton, type EnrollButtonProps } from "./enroll-buttons";

/**
 * What a student sees to get a platform. With online payments OFF (PAYMENTS_PROVIDER=none) a PAID platform shows a contact
 * notice instead of a buy button — no checkout is offered, none can be started (the action and the service refuse as well).
 * The contact address comes from the server configuration (LEGAL_CONTACT_EMAIL), never from the source.
 */
export async function EnrollControl(props: EnrollButtonProps) {
  const paid = (props.priceCents ?? 0) > 0;
  if (!paid || props.access === "REVOKED" || paymentsMode() !== "none") return <EnrollButton {...props} />;
  const t = await getTranslations("courses");
  const email = legalOperator().contactEmail;
  return (
    <p role="status" data-payments-off className={`type-small text-muted-foreground ${props.className ?? ""}`}>
      {email
        ? t.rich("paymentsOff", { email, mail: (chunks) => <a href={`mailto:${email}`} className="font-semibold text-primary underline-offset-2 hover:underline">{chunks}</a> })
        : t("paymentsOffNoContact")}
    </p>
  );
}
