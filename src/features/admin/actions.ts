"use server";

import { revalidatePath } from "next/cache";
import { services } from "@/services";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { can } from "@/lib/permissions";
import { editableResources, schemaFor, type EditableResource } from "@/lib/validators/admin";
import { serviceErrorKey } from "@/lib/validators/messages";
import { resourceConfig, type ResourceKey } from "./resources";
import type { ServiceResult } from "@/services/contracts";

/**
 * Every admin mutation goes through here:
 *  1) session  2) role + permission  3) Zod validation (never trust the browser)  4) service call
 * Field errors are returned as message CODES so the form can show them in the user's language.
 */
export type AdminActionResult =
  | { ok: true }
  | { ok: false; code: "FORBIDDEN" | "INVALID" | "FAILED"; fieldErrors?: Record<string, string>; message?: string };

const isEditable = (r: string): r is EditableResource => (editableResources as readonly string[]).includes(r);

async function authorize(resource: string) {
  const session = await sessionOrNull(STAFF_ROLES);
  if (!session || !isEditable(resource)) return null;
  const perm = resourceConfig[resource as ResourceKey].editPermission;
  return perm && can(session.user.role, perm) ? session : null;
}

function fail(res: Extract<ServiceResult<unknown>, { ok: false }>): AdminActionResult {
  const key = serviceErrorKey(res.code);
  const field = res.field === "level" ? "level" : res.field;
  return { ok: false, code: "FAILED", message: key, fieldErrors: field ? { [field]: key } : undefined };
}

function refresh(resource: string) {
  revalidatePath(`/admin/${resource}`);
  revalidatePath("/admin");
  revalidatePath("/", "layout"); // student views read the same data
}

export async function saveResourceAction(resource: string, id: string | null, raw: unknown): Promise<AdminActionResult> {
  const session = await authorize(resource);
  if (!session || !isEditable(resource)) return { ok: false, code: "FORBIDDEN" };

  const schema = schemaFor(resource, id === null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "INVALID", fieldErrors };
  }
  const v = parsed.data as Record<string, unknown> & never;
  const d = v as unknown as Record<string, string | number | boolean | string[]>;
  let res: ServiceResult<unknown>;

  switch (resource) {
    case "platforms":
      res = await services.platforms.update(String(id), { name: String(d.name), fullName: String(d.fullName), priceCents: Math.round(Number(d.price) * 100) });
      break;
    case "subjects": {
      const input = { code: String(d.code), name: String(d.name), levelId: String(d.level) };
      res = id ? await services.subjects.update(id, input) : await services.subjects.create(input);
      break;
    }
    case "topics": {
      const input = { title: String(d.title), subjectSlug: String(d.subject), description: String(d.description ?? ""), durationMinutes: Number(d.durationMinutes), lessonCount: Number(d.lessonCount) };
      res = id ? await services.topics.update(id, input) : await services.topics.create(input);
      break;
    }
    case "materials": {
      const input = {
        title: String(d.title), kind: d.kind as never, subjectSlug: String(d.subject), topicId: d.topic ? String(d.topic) : undefined,
        fileId: d.fileId ? String(d.fileId) : undefined, body: d.body ? String(d.body) : undefined,
      };
      res = id ? await services.materials.update(id, input) : await services.materials.create(input);
      break;
    }
    case "question-bank": {
      const input = {
        subjectSlug: String(d.subject), topicId: d.topic ? String(d.topic) : undefined, text: String(d.text),
        imageId: d.imageId ? String(d.imageId) : undefined, status: d.status as "draft" | "published",
        tags: String(d.tags ?? "").split(",").map((x) => x.trim()).filter(Boolean),
        options: [String(d.optionA), String(d.optionB), String(d.optionC), String(d.optionD)] as [string, string, string, string],
        correctIndex: (["a", "b", "c", "d"].indexOf(String(d.correct)) as 0 | 1 | 2 | 3),
        explanation: String(d.explanation), points: Number(d.points), difficulty: d.difficulty as never,
      };
      res = id ? await services.questions.update(id, input) : await services.questions.create(input);
      break;
    }
    case "tests": {
      const input = {
        title: String(d.title), description: String(d.description ?? ""), subjectSlug: String(d.subject), topicId: d.topic ? String(d.topic) : undefined,
        durationMinutes: Number(d.durationMinutes), passMark: Number(d.passMark), attemptsAllowed: Number(d.attemptsAllowed),
        randomizeQuestions: Boolean(d.randomizeQuestions), randomizeAnswers: Boolean(d.randomizeAnswers),
        questionIds: d.questionIds as string[], published: Boolean(d.published),
      };
      res = id ? await services.tests.update(id, input) : await services.tests.create(input);
      break;
    }
    case "access": {
      // Grant / change access. The row id is `<userId>|<platform>`; the browser never sets who the grant is for except through the form's student field.
      res = await services.enrollments.grant({ userId: String(d.student), platform: d.platform as never, expiresAt: d.expiresAt ? `${String(d.expiresAt)}T23:59:59.000Z` : null });
      break;
    }
    case "certificates": {
      if (id) return { ok: false, code: "FORBIDDEN" }; // certificates are issued / revoked, never edited
      res = await services.certificates.issue({ userId: String(d.student), subjectSlug: String(d.subject) });
      break;
    }
    case "students": {
      const input = { name: String(d.name), email: String(d.email), role: d.role as never, status: d.status as never, password: d.password ? String(d.password) : undefined };
      if (id) {
        // Nobody may change their own role/status here (prevents locking yourself out or self-escalation).
        if (id === session.user.id && (input.role !== session.user.role || input.status !== "active")) {
          return { ok: false, code: "FAILED", message: "selfProtect", fieldErrors: { role: "selfProtect" } };
        }
        res = await services.users.update(id, input);
      } else {
        res = await services.users.create({ ...input, password: String(d.password) });
      }
      break;
    }
  }
  if (!res.ok) return fail(res);
  refresh(resource);
  return { ok: true };
}

export async function setArchivedAction(resource: string, id: string, archived: boolean): Promise<AdminActionResult> {
  const session = await authorize(resource);
  if (!session || !isEditable(resource) || typeof id !== "string" || id.length > 160) return { ok: false, code: "FORBIDDEN" };
  if (resource === "students" && id === session.user.id) return { ok: false, code: "FAILED", message: "selfProtect" };

  let res: ServiceResult<unknown>;
  switch (resource) {
    case "platforms": res = await services.platforms.setArchived(id, archived); break;
    case "subjects": res = await services.subjects.setArchived(id, archived); break;
    case "topics": res = await services.topics.setArchived(id, archived); break;
    case "materials": res = await services.materials.setArchived(id, archived); break;
    case "question-bank": res = await services.questions.setArchived(id, archived); break;
    case "tests": res = await services.tests.setArchived(id, archived); break;
    case "students": res = await services.users.setArchived(id, archived); break;
    case "certificates": res = await services.certificates.setRevoked(id, archived); break;
    case "access": {
      const [userId, platform] = id.split("|");
      if (!userId || (platform !== "acca" && platform !== "fia")) return { ok: false, code: "FORBIDDEN" };
      res = archived ? await services.enrollments.revoke({ userId, platform }) : await services.enrollments.grant({ userId, platform });
      break;
    }
  }
  if (!res.ok) return fail(res);
  refresh(resource);
  return { ok: true };
}

/** Quick actions on tests: publish / unpublish and duplicate. Same authorisation as editing a test. */
export async function setTestPublishedAction(id: string, published: boolean): Promise<AdminActionResult> {
  const session = await authorize("tests");
  if (!session || typeof id !== "string" || id.length > 160) return { ok: false, code: "FORBIDDEN" };
  const res = await services.tests.setPublished(id, published === true);
  if (!res.ok) return fail(res);
  refresh("tests");
  return { ok: true };
}

export async function duplicateTestAction(id: string): Promise<AdminActionResult> {
  const session = await authorize("tests");
  if (!session || typeof id !== "string" || id.length > 160) return { ok: false, code: "FORBIDDEN" };
  const res = await services.tests.duplicate(id);
  if (!res.ok) return fail(res);
  refresh("tests");
  return { ok: true };
}
