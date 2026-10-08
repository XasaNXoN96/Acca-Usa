import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/app-mode";
import { formatMoney } from "@/lib/format";
import { services } from "@/services";
import { DemoCheckoutForm } from "@/features/payments/demo-checkout-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("payments.demo"))("title"), robots: { index: false } };
}

/** DEMO simulation of a provider checkout. Does not exist in production mode (404), and moves no money anywhere. */
export default async function DemoCheckoutPage({ params }: { params: Promise<{ paymentId: string }> }) {
  if (!isDemoMode) notFound();
  const { paymentId } = await params;
  const session = await requireSession();
  const [t, payment] = await Promise.all([getTranslations("payments.demo"), services.payments.getForUser(session.user.id, paymentId)]);
  if (!payment) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Alert variant="warning"><FlaskConical className="mr-1.5 inline size-4" aria-hidden />{t("notice")}</Alert>
      <Card className="space-y-4 p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="type-eyebrow text-muted-foreground">{t("item")}</dt><dd className="font-semibold">{payment.description}</dd></div>
          <div><dt className="type-eyebrow text-muted-foreground">{t("amount")}</dt><dd className="font-semibold tabular-nums">{formatMoney(payment.amountCents, payment.currency, "en")}</dd></div>
        </dl>
        {payment.status === "pending" ? <DemoCheckoutForm paymentId={payment.id} /> : <Alert variant="info">{t("alreadyDone")}</Alert>}
      </Card>
    </div>
  );
}
