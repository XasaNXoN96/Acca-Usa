import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardCheck, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { StudentShell } from "@/components/layout/student-shell";
import { MaterialViewer, type ViewerFile } from "@/features/material/material-viewer";
import { MaterialCompleteButton } from "@/features/material/complete-button";
import { MaterialTouch } from "@/features/material/material-touch";
import { watermarkText } from "@/features/material/watermark";
import { services } from "@/services";
import { getStorage } from "@/services/storage";
import { routes } from "@/lib/routes";
import { requireSession } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";

type Params = Promise<{ subject: string; topic: string; material: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { topic, material } = await params;
  const session = await getSession();
  const ctx = session ? await services.topics.getContext(topic, session.user.id) : null;
  return { title: ctx?.materials.find((m) => m.id === material)?.title ?? "—" };
}

/** Protected twice: proxy (session pre-check) and requireSession + the access checks below (authoritative). */
export default async function MaterialPage({ params }: { params: Params }) {
  return (
    <StudentShell>
      <MaterialContent params={await params} />
    </StudentShell>
  );
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

async function MaterialContent({ params }: { params: Awaited<Params> }) {
  const session = await requireSession();
  const ctx = await services.topics.getContext(params.topic, session.user.id);
  if (!ctx) notFound();
  const { topic, subject, materials } = ctx;
  if (subject.slug !== params.subject) redirect(routes.subjectMaterial(subject.slug, topic.id, params.material));
  const index = materials.findIndex((m) => m.id === params.material);
  const material = materials[index];
  if (!material) notFound();

  const isAdmin = session.user.role === "ADMIN";
  // Server-side access control. Admin may open everything (content review); students need enrolment + an unlocked topic.
  if (!isAdmin && !(await services.enrollments.isEnrolled(session.user.id, subject.platform))) redirect(routes.coursePlatform(subject.platform));

  const [t, n, c, ms, tests, completedIds] = await Promise.all([
    getTranslations("material"),
    getTranslations("nav"),
    getTranslations("common"),
    getTranslations("subject"),
    services.tests.listForSubject(subject.slug, session.user.id),
    services.progress.listCompletedMaterials(session.user.id, materials.map((m) => m.id)),
  ]);
  const crumbs = [
    { label: n("courses"), href: routes.courses },
    { label: subject.platform.toUpperCase(), href: routes.coursePlatform(subject.platform) },
    { label: subject.code, href: routes.subject(subject.slug) },
    { label: topic.title, href: routes.subjectTopic(subject.slug, topic.id) },
    { label: material.title },
  ];

  if (!isAdmin && topic.status === "locked") {
    return (
      <div className="space-y-6">
        <Breadcrumbs label={c("breadcrumb")} items={crumbs} />
        <EmptyState
          icon={<Lock aria-hidden />}
          title={t("lockedTitle")}
          description={t("lockedText")}
          action={<Button asChild><Link href={routes.subject(subject.slug)}>{t("backToTopic")}</Link></Button>}
        />
      </div>
    );
  }

  let file: ViewerFile | null = null;
  if (material.fileId) {
    const stat = await getStorage().stat(material.fileId);
    if (stat) {
      const ext = stat.name.includes(".") ? stat.name.split(".").pop()!.toUpperCase() : "FILE";
      file = { name: stat.name, mime: stat.mime, sizeLabel: formatSize(stat.size), typeLabel: ext };
    }
  }

  const prev = materials[index - 1];
  const next = materials[index + 1];
  const href = (id: string) => routes.subjectMaterial(subject.slug, topic.id, id);
  const testId = tests.find((x) => x.topicId === topic.id)?.id ?? null;
  const completed = completedIds.includes(material.id);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {isAdmin ? null : <MaterialTouch materialId={material.id} />}
      <Breadcrumbs label={c("breadcrumb")} items={crumbs} />
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{ms(`materialKinds.${material.kind}`)}</Badge>
          <span className="type-caption text-muted-foreground">{t("pageOf", { current: index + 1, total: materials.length })}</span>
          {completed ? <Badge variant="success">{t("completed")}</Badge> : null}
        </div>
        <h1 className="type-h1 text-balance [overflow-wrap:anywhere]">{material.title}</h1>
      </header>

      <div className="min-w-0" data-material-kind={material.kind}>
        <MaterialViewer material={{ id: material.id, title: material.title, kind: material.kind, fileId: material.fileId, body: material.body }} file={file} canDownload={isAdmin} watermark={watermarkText(session.user)} />
      </div>

      <div className="space-y-4 border-t border-border pt-5">
        <MaterialCompleteButton materialId={material.id} completed={completed} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {prev ? (
            <Button asChild variant="outline" className="order-2 sm:order-1">
              <Link href={href(prev.id)} rel="prev"><ArrowLeft aria-hidden />{t("previous")}</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="order-2 sm:order-1"><Link href={routes.subjectTopic(subject.slug, topic.id)}><ArrowLeft aria-hidden />{t("backToTopic")}</Link></Button>
          )}
          {next ? (
            <Button asChild variant="navy" className="order-1 sm:order-2">
              <Link href={href(next.id)} rel="next">{t("next")}<ArrowRight aria-hidden /></Link>
            </Button>
          ) : testId ? (
            <Button asChild variant="navy" className="order-1 sm:order-2">
              <Link href={routes.test(testId)}><ClipboardCheck aria-hidden />{t("takeTest")}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
