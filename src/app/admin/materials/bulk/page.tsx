import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { BulkUpload } from "@/features/admin/bulk-upload";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";
import { services } from "@/services";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.bulk"))("title") };
}

export default async function Page() {
  const session = await requireSession(STAFF_ROLES);
  const [t, s] = await Promise.all([getTranslations("admin.bulk"), getTranslations("states")]);
  if (!can(session.user.role, "manage_content")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  const [subjects, topics] = await Promise.all([services.subjects.listAll(), services.topics.listAll()]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<Button asChild variant="outline"><Link href="/admin/materials"><ArrowLeft aria-hidden />{t("back")}</Link></Button>}
      />
      <BulkUpload
        subjects={subjects.filter((x) => !x.archived).map((x) => ({ value: x.slug, label: `${x.code} — ${x.name}` }))}
        topics={topics.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.title, subject: x.subjectSlug }))}
      />
    </div>
  );
}
