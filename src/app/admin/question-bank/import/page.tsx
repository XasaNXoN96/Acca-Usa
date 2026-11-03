import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { QuestionImport } from "@/features/admin/question-import";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.questionImport"))("title") };
}

export default async function Page() {
  const session = await requireSession(STAFF_ROLES);
  const [t, s] = await Promise.all([getTranslations("admin.questionImport"), getTranslations("states")]);
  if (!can(session.user.role, "manage_tests")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} actions={<Button asChild variant="outline"><Link href="/admin/question-bank"><ArrowLeft aria-hidden />{t("back")}</Link></Button>} />
      <QuestionImport />
    </div>
  );
}
