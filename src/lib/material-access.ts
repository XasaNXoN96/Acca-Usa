import "server-only";
import type { Session } from "@/services";
import { services } from "@/services";

/**
 * Server-side access rule for everything that belongs to a material (file bytes, subtitles, transcript):
 * staff may read; a student needs an active enrolment in the subject's platform and an unlocked topic.
 */
export async function canReadMaterial(session: Session, materialId: string): Promise<"ok" | "forbidden" | "notfound"> {
  const material = await services.materials.getById(materialId);
  if (!material || material.archived) return "notfound";
  if (session.user.role !== "STUDENT") return "ok";
  if (material.published === false || (material.publishAt && new Date(material.publishAt).getTime() > Date.now())) return "notfound"; // draft / scheduled
  const subject = await services.subjects.getBySlug(material.subjectSlug);
  if (!subject) return "notfound";
  if (!(await services.enrollments.isEnrolled(session.user.id, subject.platform))) return "forbidden";
  if (material.topicId) {
    const tctx = await services.topics.getContext(material.topicId, session.user.id);
    if (!tctx || tctx.topic.status === "locked") return "forbidden";
  }
  return "ok";
}
