import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/states";
import { RestoreNotice, VersionRestoreButton } from "@/features/admin/version-restore-button";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { services } from "@/services";
import { MAX_MATERIAL_VERSIONS } from "@/services/domain/records";
import { getStorage } from "@/services/storage";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.versions"))("title") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(STAFF_ROLES);
  const { id } = await params;
  const [t, s, locale] = await Promise.all([getTranslations("admin.versions"), getTranslations("states"), getLocale()]);
  if (!can(session.user.role, "manage_content")) return <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />;
  const [material, versions, users] = await Promise.all([services.materials.getById(id), services.materialVersions.list(id), services.users.listStudents()]);
  if (!material) notFound();
  const current = material.fileId ? await getStorage().stat(material.fileId) : null;
  const who = (uid?: string) => users.find((u) => u.id === uid)?.name;
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("for", { title: material.title })}
        actions={<Button asChild variant="outline"><Link href="/admin/materials"><ArrowLeft aria-hidden />{t("back")}</Link></Button>} />
      <p className="type-small max-w-2xl text-muted-foreground">{t("help")} {t("limit", { count: MAX_MATERIAL_VERSIONS })}</p>

      <RestoreNotice />
      <section aria-labelledby="ver-current" className="space-y-2 rounded-xl border border-border p-4">
        <h2 id="ver-current" className="type-h3 flex items-center gap-2">{t("current")} <Badge variant="success">{material.kind}</Badge></h2>
        <p className="type-small text-muted-foreground">{current ? `${t("file")}: ${current.name}` : material.body ? `${t("notes")}: ${material.body.slice(0, 160)}` : "—"}</p>
      </section>

      {versions.length === 0 ? <p className="text-muted-foreground" data-versions-empty>{t("none")}</p> : (
        <ol className="space-y-3" aria-label={t("title")}>
          {versions.map((v, i) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4" data-version>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">v{versions.length - i} · {formatDateTime(v.createdAt, locale)} <Badge variant="outline">{v.kind}</Badge></p>
                <p className="type-small text-muted-foreground [overflow-wrap:anywhere]">
                  {v.fileName ? `${t("file")}: ${v.fileName}` : v.bodyPreview ? `${t("notes")}: ${v.bodyPreview}` : "—"}
                  {v.fileStatus && v.fileStatus !== "READY" ? ` · ${t("notReady")}` : ""}
                  {who(v.createdById) ? ` · ${t("by", { name: who(v.createdById) ?? "" })}` : ""}
                </p>
              </div>
              {v.fileId && v.fileStatus === "READY" ? <Button asChild variant="ghost" size="sm"><a href={`/api/files/${encodeURIComponent(v.fileId)}`} target="_blank" rel="noopener noreferrer">{t("open")}</a></Button> : null}
              <VersionRestoreButton materialId={id} versionId={v.id} disabled={!!v.fileId && v.fileStatus !== "READY"} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
