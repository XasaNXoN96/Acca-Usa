import { notFound, redirect } from "next/navigation";
import { services } from "@/services";
import { routes } from "@/lib/routes";

/** Legacy /topic/<id> links (notifications, activity, search) → canonical /subject/<slug>/topic/<id>. */
export default async function LegacyTopicRedirect({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const found = (await services.topics.listAll()).find((t) => t.id === topic && !t.archived);
  if (!found) notFound();
  redirect(routes.subjectTopic(found.subjectSlug, found.id));
}
