import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MediaTextPanel } from "@/features/admin/media/media-text-panel";
import { requireSession, STAFF_ROLES } from "@/lib/auth/guards";
import { services } from "@/services";
import { transcriptToText } from "@/services/media/subtitles";
import { speechConnected } from "@/services/speech";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.mediaText"))("title") };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession(STAFF_ROLES);
  const { id } = await params;
  const [t, material, transcript, subtitles] = await Promise.all([
    getTranslations("admin.mediaText"), services.materials.getById(id), services.mediaText.getTranscript(id), services.mediaText.listSubtitles(id),
  ]);
  if (!material || material.archived || (material.kind !== "video" && material.kind !== "audio")) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("for", { title: material.title })}
        actions={<Button asChild variant="outline"><Link href="/admin/materials"><ArrowLeft aria-hidden />{t("back")}</Link></Button>}
      />
      <MediaTextPanel
        materialId={id}
        initial={{
          sttConnected: speechConnected(),
          transcript: transcript ? { language: transcript.language, status: transcript.status, provider: transcript.provider, errorCode: transcript.errorCode, text: transcriptToText(transcript.segments) } : null,
          subtitles: subtitles.map((s) => ({ language: s.language, enabled: s.enabled })),
        }}
      />
    </div>
  );
}
