import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { MfaSetup } from "@/features/admin/mfa-setup";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { mfaRequiredFor } from "@/lib/auth/mfa-policy";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.security"))("title") };
}

export default async function SecurityPage() {
  const session = await requireSession(STAFF_ROLES);
  const t = await getTranslations("admin.security");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <MfaSetup user={session.user} required={mfaRequiredFor(session.user.role)} />
    </div>
  );
}
