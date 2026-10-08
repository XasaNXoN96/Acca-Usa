import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { services } from "@/services";
import { formatDate, formatMoney } from "@/lib/format";
import { requireSession } from "@/lib/auth/guards";
import { isDemoMode } from "@/lib/app-mode";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("payments"))("title") };
}

const variant = { paid: "success", pending: "warning", refunded: "neutral", failed: "destructive", cancelled: "neutral" } as const;

type Search = Promise<{ paid?: string; failed?: string; cancelled?: string }>;

/**
 * The banner after a checkout comes from the payment's STORED status, never from the URL: `?paid=<id>` alone proves nothing
 * and grants nothing — only the provider's webhook marks a payment as paid.
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const q = await searchParams;
  const [t, c, locale, payments, returned] = await Promise.all([
    getTranslations("payments"),
    getTranslations("common"),
    getLocale(),
    services.payments.listForUser(session.user.id),
    (async () => {
      const id = q.paid ?? q.failed ?? q.cancelled;
      return id && id.length <= 80 ? services.payments.getForUser(session.user.id, id) : null; // ownership is checked by the service
    })(),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {returned ? (
        <Alert variant={returned.status === "paid" ? "success" : returned.status === "pending" ? "info" : "warning"}>
          {returned.status === "paid" ? t("paid") : returned.status === "pending" ? (q.paid ? t("pendingConfirm") : t("cancelledBanner")) : returned.status === "failed" ? t("failedBanner") : t("cancelledBanner")}
        </Alert>
      ) : null}
      <Alert variant="info">{isDemoMode ? t("demoNotice") : t("liveNotice")}</Alert>
      {payments.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <DataTable
          caption={t("title")}
          columns={[
            { key: "description", header: c("description"), mobile: "title" },
            { key: "date", header: c("date") },
            { key: "status", header: c("status") },
            { key: "amount", header: c("amount"), align: "right" },
          ]}
          rows={payments.map((p) => ({
            id: p.id,
            cells: {
              description: <span className="font-semibold">{p.description}</span>,
              date: formatDate(p.createdAt, locale),
              status: <Badge variant={variant[p.status]}>{t(`status.${p.status}`)}</Badge>,
              amount: formatMoney(p.amountCents, p.currency, locale),
            },
          }))}
        />
      )}
    </>
  );
}
