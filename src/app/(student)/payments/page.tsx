import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { services } from "@/services";
import { formatDate, formatMoney } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("payments"))("title") };
}

const variant = { paid: "success", pending: "warning", refunded: "neutral", failed: "destructive" } as const;

export default async function PaymentsPage() {
  const session = await services.auth.getSession("STUDENT");
  const [t, c, locale, payments] = await Promise.all([
    getTranslations("payments"),
    getTranslations("common"),
    getLocale(),
    services.payments.listForUser(session.user.id),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Alert variant="info">{t("notice")}</Alert>
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
