import "server-only";
import { randomUUID } from "node:crypto";
import type { EnrollmentStatus, Prisma, Material as DbMaterial } from "@prisma/client";
import type {
  EnrollmentService, MaterialInput, MaterialService, PlatformService, SearchService, SubjectService, TopicService,
} from "../contracts";
import type { Material, MaterialKind, Platform, PlatformSlug, Subject } from "@/types";
import { routes } from "@/lib/routes";
import { getPrisma } from "@/lib/prisma";
import { getStorage } from "../storage";
import { formatDuration } from "../storage/media-info";
import { uploadKindFor, uploadRules } from "../storage/validation";
import { enrollmentActive, platformProgress, topicsWithStatus, visibleTopicsOf } from "../domain/calc";
import { slugify } from "../domain/ids";
import { notifyEnrolled, notifyUser, recordActivity } from "./events";
import { loadCalcDbForRead } from "./load";

const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const iso = (d: Date | null) => (d ? d.toISOString() : undefined);
const err = (code: string, field?: string) => ({ ok: false as const, code, field });

const visibleSubjectWhere: Prisma.SubjectWhereInput = { deletedAt: null, level: { platform: { deletedAt: null } } };
const visibleTopicWhere: Prisma.TopicWhereInput = { deletedAt: null, subject: visibleSubjectWhere };
const visibleMaterialWhere: Prisma.MaterialWhereInput = { deletedAt: null, subject: visibleSubjectWhere, OR: [{ topicId: null }, { topic: { deletedAt: null } }] };

/* ---------------- platforms ---------------- */

type PlatformRow = Prisma.PlatformGetPayload<{ include: { levels: true } }>;
const toPlatform = (p: PlatformRow): Platform => ({
  slug: p.slug as PlatformSlug, name: p.name, fullName: p.fullName, priceCents: p.priceCents, archived: !!p.deletedAt,
  levels: [...p.levels].sort((a, b) => a.order - b.order).map((l) => ({ id: l.id, platform: p.slug as PlatformSlug, name: l.name, order: l.order })),
});

export const platformService: PlatformService = {
  async list() {
    return (await getPrisma().platform.findMany({ where: { deletedAt: null }, include: { levels: true }, orderBy: { slug: "asc" } })).map(toPlatform);
  },
  async listAll() {
    return (await getPrisma().platform.findMany({ include: { levels: true }, orderBy: { slug: "asc" } })).map(toPlatform);
  },
  async getBySlug(slug) {
    const p = await getPrisma().platform.findFirst({ where: { slug, deletedAt: null }, include: { levels: true } });
    return p ? toPlatform(p) : null;
  },
  async update(slug, input) {
    const r = await getPrisma().platform.updateMany({ where: { slug }, data: { name: input.name.trim(), fullName: input.fullName.trim(), priceCents: input.priceCents } });
    return r.count ? { ok: true, data: undefined } : err("NOT_FOUND");
  },
  async setArchived(slug, archived) {
    const r = await getPrisma().platform.updateMany({ where: { slug }, data: { deletedAt: archived ? new Date() : null } });
    return r.count ? { ok: true, data: undefined } : err("NOT_FOUND");
  },
};

/* ---------------- subjects ---------------- */

const subjectInclude = {
  level: true,
  _count: { select: { topics: { where: { deletedAt: null } }, tests: { where: { deletedAt: null, published: true } } } },
} satisfies Prisma.SubjectInclude;
type SubjectRow = Prisma.SubjectGetPayload<{ include: typeof subjectInclude }>;

const toSubject = (s: SubjectRow): Subject => ({
  slug: s.slug, code: s.code, name: s.name, platform: s.level.platformSlug as PlatformSlug, levelId: s.levelId,
  topicCount: s._count.topics, testCount: s._count.tests, archived: !!s.deletedAt,
});

export const subjectService: SubjectService = {
  async list() {
    return (await getPrisma().subject.findMany({ where: visibleSubjectWhere, include: subjectInclude, orderBy: [{ level: { platformSlug: "asc" } }, { level: { order: "asc" } }, { position: "asc" }, { code: "asc" }] })).map(toSubject);
  },
  async listAll() {
    return (await getPrisma().subject.findMany({ include: subjectInclude, orderBy: [{ level: { platformSlug: "asc" } }, { level: { order: "asc" } }, { position: "asc" }, { code: "asc" }] })).map(toSubject);
  },
  async listByPlatform(slug) {
    return (await getPrisma().subject.findMany({ where: { ...visibleSubjectWhere, level: { platformSlug: slug, platform: { deletedAt: null } } }, include: subjectInclude, orderBy: [{ level: { order: "asc" } }, { position: "asc" }, { code: "asc" }] })).map(toSubject);
  },
  async getBySlug(slug) {
    const s = await getPrisma().subject.findFirst({ where: { slug, ...visibleSubjectWhere }, include: subjectInclude });
    return s ? toSubject(s) : null;
  },
  async create(input) {
    const prisma = getPrisma();
    if (!(await prisma.level.findUnique({ where: { id: input.levelId } }))) return err("NOT_FOUND", "level");
    if (await prisma.subject.findFirst({ where: { levelId: input.levelId, deletedAt: null, code: { equals: input.code.trim(), mode: "insensitive" } } })) return err("DUPLICATE", "code");
    const base = slugify(input.code);
    let slug = base;
    for (let n = 2; await prisma.subject.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;
    const last = await prisma.subject.aggregate({ _max: { position: true } });
    const s = await prisma.subject.create({ data: { slug, code: input.code.trim(), name: input.name.trim(), levelId: input.levelId, position: (last._max.position ?? 0) + 1 }, include: subjectInclude });
    return { ok: true, data: toSubject(s) };
  },
  async update(slug, input) {
    const prisma = getPrisma();
    if (!(await prisma.subject.findUnique({ where: { slug } }))) return err("NOT_FOUND");
    if (!(await prisma.level.findUnique({ where: { id: input.levelId } }))) return err("NOT_FOUND", "level");
    if (await prisma.subject.findFirst({ where: { slug: { not: slug }, levelId: input.levelId, deletedAt: null, code: { equals: input.code.trim(), mode: "insensitive" } } })) return err("DUPLICATE", "code");
    await prisma.subject.update({ where: { slug }, data: { code: input.code.trim(), name: input.name.trim(), levelId: input.levelId } });
    return { ok: true, data: undefined };
  },
  async setArchived(slug, archived) {
    const r = await getPrisma().subject.updateMany({ where: { slug }, data: { deletedAt: archived ? new Date() : null } });
    return r.count ? { ok: true, data: undefined } : err("NOT_FOUND");
  },
};

/* ---------------- materials ---------------- */

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function toMaterial(r: DbMaterial): Promise<Material> {
  let meta: string = r.kind === "notes" ? "Notes" : r.kind;
  let fileMime = r.fileMime ?? undefined;
  if (r.fileId) {
    const f = await getStorage().stat(r.fileId);
    if (f) {
      meta = `${f.durationSeconds ? `${formatDuration(f.durationSeconds)} · ` : ""}${formatSize(f.size)} · ${f.name.split(".").pop()?.toUpperCase() ?? ""}`;
      fileMime = f.mime;
    }
  }
  return {
    id: r.id, subjectSlug: r.subjectSlug, topicId: r.topicId ?? undefined, kind: r.kind, title: r.title, meta,
    fileId: r.fileId ?? undefined, fileMime, body: r.body ?? undefined, createdAt: r.createdAt.toISOString(), archived: !!r.deletedAt,
  };
}

async function checkMaterial(input: MaterialInput) {
  const prisma = getPrisma();
  if (!(await prisma.subject.findFirst({ where: { slug: input.subjectSlug, deletedAt: null } }))) return err("NOT_FOUND", "subject");
  if (input.topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: input.topicId, deletedAt: null } });
    if (!topic || topic.subjectSlug !== input.subjectSlug) return err("TOPIC_MISMATCH", "topic");
  }
  if (input.kind === "notes") return input.body?.trim() ? null : err("NOTES_REQUIRED", "body");
  if (!input.fileId) return err("FILE_REQUIRED", "fileId");
  const file = await getStorage().stat(input.fileId);
  if (!file) return err("FILE_REQUIRED", "fileId");
  const rule = uploadKindFor(input.kind);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!rule || !uploadRules[rule].exts.includes(ext)) return err("FILE_TYPE", "fileId");
  return null;
}

export const materialService: MaterialService = {
  async listForSubject(slug) {
    const rows = await getPrisma().material.findMany({ where: { subjectSlug: slug, ...visibleMaterialWhere }, orderBy: { createdAt: "asc" } });
    return Promise.all(rows.map(toMaterial));
  },
  async listAll() {
    return Promise.all((await getPrisma().material.findMany({ orderBy: { createdAt: "asc" } })).map(toMaterial));
  },
  async getById(id) {
    const r = await getPrisma().material.findUnique({ where: { id } });
    return r ? toMaterial(r) : null;
  },
  async getByFileId(fileId) {
    const r = await getPrisma().material.findFirst({ where: { fileId, deletedAt: null } });
    return r ? toMaterial(r) : null;
  },
  async create(input) {
    const bad = await checkMaterial(input);
    if (bad) return bad;
    const prisma = getPrisma();
    const rec = await prisma.material.create({
      data: {
        id: newId("mat"), subjectSlug: input.subjectSlug, topicId: input.topicId || null, kind: input.kind, title: input.title.trim(),
        fileId: input.kind === "notes" ? null : (input.fileId ?? null), body: input.kind === "notes" ? input.body : null,
      },
    });
    if (rec.fileId) await getStorage().markAttached(rec.fileId, true);
    const subject = await prisma.subject.findUnique({ where: { slug: rec.subjectSlug }, include: { level: true } });
    if (subject) {
      await notifyEnrolled(subject.level.platformSlug as PlatformSlug, {
        code: "material_added", params: { material: rec.title, subject: subject.code },
        target: rec.topicId ? { kind: "material", subjectSlug: rec.subjectSlug, topicId: rec.topicId, id: rec.id } : { kind: "subject", slug: rec.subjectSlug },
      });
    }
    return { ok: true, data: await toMaterial(rec) };
  },
  async update(id, input) {
    const prisma = getPrisma();
    const rec = await prisma.material.findUnique({ where: { id } });
    if (!rec) return err("NOT_FOUND");
    const bad = await checkMaterial(input);
    if (bad) return bad;
    const nextFile = input.kind === "notes" ? null : (input.fileId ?? null);
    if (rec.fileId && rec.fileId !== nextFile) await getStorage().delete(rec.fileId); // replaced or removed
    if (nextFile && nextFile !== rec.fileId) await getStorage().markAttached(nextFile, true);
    await prisma.material.update({
      where: { id },
      data: {
        title: input.title.trim(), kind: input.kind as MaterialKind, subjectSlug: input.subjectSlug, topicId: input.topicId || null,
        fileId: nextFile, fileMime: null, body: input.kind === "notes" ? input.body : null,
      },
    });
    return { ok: true, data: undefined };
  },
  async setArchived(id, archived) {
    const r = await getPrisma().material.updateMany({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
    return r.count ? { ok: true, data: undefined } : err("NOT_FOUND");
  },
};

/* ---------------- topics ---------------- */

export const topicService: TopicService = {
  async listPublic(subjectSlug) {
    const topics = await getPrisma().topic.findMany({
      where: { subjectSlug, ...visibleTopicWhere }, orderBy: { order: "asc" },
      include: { materials: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, kind: true } } },
    });
    return topics.map((t, i) => ({ id: t.id, order: i + 1, title: t.title, materials: t.materials }));
  },
  async listForSubject(subjectSlug, userId) {
    return topicsWithStatus(await loadCalcDbForRead([userId]), userId, subjectSlug);
  },
  async getContext(topicId, userId) {
    const prisma = getPrisma();
    const rec = await prisma.topic.findFirst({ where: { id: topicId, ...visibleTopicWhere } });
    if (!rec) return null;
    const subject = await prisma.subject.findFirst({ where: { slug: rec.subjectSlug, ...visibleSubjectWhere }, include: subjectInclude });
    if (!subject) return null;
    const list = topicsWithStatus(await loadCalcDbForRead([userId]), userId, rec.subjectSlug);
    const idx = list.findIndex((t) => t.id === topicId);
    const current = list[idx];
    if (!current) return null;
    const mats = await prisma.material.findMany({ where: { topicId, ...visibleMaterialWhere }, orderBy: { createdAt: "asc" } });
    return { topic: current, subject: toSubject(subject), previous: list[idx - 1] ?? null, next: list[idx + 1] ?? null, materials: await Promise.all(mats.map(toMaterial)) };
  },
  async listAll() {
    const rows = await getPrisma().topic.findMany({ orderBy: [{ subjectSlug: "asc" }, { order: "asc" }] });
    return rows.map((t) => ({
      id: t.id, title: t.title, subjectSlug: t.subjectSlug, order: t.order, durationMinutes: t.durationMinutes,
      description: t.description, lessonCount: t.lessonCount, archived: !!t.deletedAt,
    }));
  },
  async create(input) {
    const prisma = getPrisma();
    const subject = await prisma.subject.findFirst({ where: { slug: input.subjectSlug, deletedAt: null }, include: { level: true } });
    if (!subject) return err("NOT_FOUND", "subject");
    if (await prisma.topic.findFirst({ where: { subjectSlug: input.subjectSlug, deletedAt: null, title: { equals: input.title.trim(), mode: "insensitive" } } })) return err("DUPLICATE", "title");
    const base = `${input.subjectSlug}-${slugify(input.title)}`;
    let id = base;
    for (let n = 2; await prisma.topic.findUnique({ where: { id } }); n++) id = `${base}-${n}`;
    const last = await prisma.topic.aggregate({ where: { subjectSlug: input.subjectSlug }, _max: { order: true } });
    await prisma.topic.create({
      data: { id, subjectSlug: input.subjectSlug, order: (last._max.order ?? 0) + 1, title: input.title.trim(), lessonCount: input.lessonCount, durationMinutes: input.durationMinutes, description: input.description.trim(), keyPoints: [] },
    });
    await notifyEnrolled(subject.level.platformSlug as PlatformSlug, { code: "course_updated", params: { subject: subject.code, topic: input.title.trim() }, target: { kind: "subject", slug: subject.slug } });
    return { ok: true, data: { id } };
  },
  async update(id, input) {
    const prisma = getPrisma();
    const rec = await prisma.topic.findUnique({ where: { id } });
    if (!rec) return err("NOT_FOUND");
    if (!(await prisma.subject.findFirst({ where: { slug: input.subjectSlug, deletedAt: null } }))) return err("NOT_FOUND", "subject");
    await prisma.$transaction(async (tx) => {
      let order = rec.order;
      if (rec.subjectSlug !== input.subjectSlug) {
        order = ((await tx.topic.aggregate({ where: { subjectSlug: input.subjectSlug }, _max: { order: true } }))._max.order ?? 0) + 1;
        await tx.material.updateMany({ where: { topicId: id }, data: { subjectSlug: input.subjectSlug } });
        await tx.test.updateMany({ where: { topicId: id }, data: { subjectSlug: input.subjectSlug } });
      }
      await tx.topic.update({
        where: { id },
        data: { title: input.title.trim(), subjectSlug: input.subjectSlug, order, description: input.description.trim(), durationMinutes: input.durationMinutes, lessonCount: input.lessonCount },
      });
    });
    return { ok: true, data: undefined };
  },
  async setArchived(id, archived) {
    const r = await getPrisma().topic.updateMany({ where: { id }, data: { deletedAt: archived ? new Date() : null } });
    return r.count ? { ok: true, data: undefined } : err("NOT_FOUND");
  },
};

/* ---------------- enrolment ("My platforms") ---------------- */

const activeEnrollment = (userId: string): Prisma.EnrollmentWhereInput => ({
  userId, status: { in: ["FREE", "ACTIVE"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});
/** Stored state, where an ACTIVE / FREE enrolment past its expiry reads as EXPIRED. */
const effectiveAccess = (e: { status: EnrollmentStatus; expiresAt: Date | null }): EnrollmentStatus =>
  (e.status === "FREE" || e.status === "ACTIVE") && e.expiresAt && e.expiresAt.getTime() <= Date.now() ? "EXPIRED" : e.status;

export const enrollmentService: EnrollmentService = {
  async listForUser(userId) {
    const prisma = getPrisma();
    const [platforms, mine, calc] = await Promise.all([
      prisma.platform.findMany({ where: { deletedAt: null }, orderBy: { slug: "asc" } }),
      prisma.enrollment.findMany({ where: { userId } }),
      loadCalcDbForRead([userId]),
    ]);
    return platforms.map((p) => {
      const rec = mine.find((e) => e.platformSlug === p.slug);
      const active = !!rec && enrollmentActive({ status: rec.status, expiresAt: iso(rec.expiresAt) });
      return {
        platform: p.slug as PlatformSlug, status: active ? ("active" as const) : ("not_enrolled" as const), access: rec ? effectiveAccess(rec) : undefined,
        expiresAt: iso(rec?.expiresAt ?? null), priceCents: p.priceCents, progress: active ? platformProgress(calc, userId, p.slug as PlatformSlug) : 0,
      };
    });
  },
  async isEnrolled(userId, platform) {
    return (await getPrisma().enrollment.count({ where: { ...activeEnrollment(userId), platformSlug: platform } })) > 0;
  },
  async enroll(userId, platform) {
    const prisma = getPrisma();
    const p = await prisma.platform.findFirst({ where: { slug: platform, deletedAt: null } });
    if (!p) return err("NOT_FOUND");
    if (p.priceCents > 0) return err("PAYMENT_REQUIRED"); // paid platforms: access only from a verified payment
    const existing = await prisma.enrollment.findUnique({ where: { userId_platformSlug: { userId, platformSlug: platform } } });
    if (existing && enrollmentActive({ status: existing.status, expiresAt: iso(existing.expiresAt) })) return { ok: true, data: undefined };
    if (existing?.status === "REVOKED") return err("ACCESS_REVOKED");
    await prisma.enrollment.upsert({
      where: { userId_platformSlug: { userId, platformSlug: platform } },
      create: { userId, platformSlug: platform, status: "FREE", source: "self" },
      update: { status: "FREE", expiresAt: null },
    });
    await recordActivity({ userId, kind: "enroll", title: p.name, context: p.fullName, href: routes.coursePlatform(platform) });
    return { ok: true, data: undefined };
  },
  async leave(userId, platform) {
    // Only self-service (free) enrolments can be left; paid / admin-granted access is managed by the school.
    await getPrisma().enrollment.deleteMany({ where: { userId, platformSlug: platform, source: "self" } });
    return { ok: true, data: undefined };
  },
  async grant({ userId, platform, expiresAt }) {
    const prisma = getPrisma();
    const [user, p] = await Promise.all([
      prisma.user.findFirst({ where: { id: userId, role: "STUDENT", deletedAt: null } }),
      prisma.platform.findFirst({ where: { slug: platform, deletedAt: null } }),
    ]);
    if (!user) return err("NOT_FOUND", "student");
    if (!p) return err("NOT_FOUND", "platform");
    const when = expiresAt === undefined ? undefined : expiresAt === null ? null : new Date(expiresAt);
    await prisma.enrollment.upsert({
      where: { userId_platformSlug: { userId, platformSlug: platform } },
      create: { userId, platformSlug: platform, status: "ACTIVE", source: "admin", expiresAt: when ?? null },
      update: { status: "ACTIVE", source: "admin", ...(when !== undefined ? { expiresAt: when } : {}) },
    });
    await notifyUser(userId, { code: "access_granted", params: { platform: platform.toUpperCase() }, target: { kind: "none" } });
    return { ok: true, data: undefined };
  },
  async revoke({ userId, platform }) {
    const r = await getPrisma().enrollment.updateMany({ where: { userId, platformSlug: platform }, data: { status: "REVOKED" } });
    if (!r.count) return err("NOT_FOUND");
    await notifyUser(userId, { code: "access_revoked", params: { platform: platform.toUpperCase() }, target: { kind: "none" } });
    return { ok: true, data: undefined };
  },
  async listAll() {
    const rows = await getPrisma().enrollment.findMany({ orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } });
    return rows.map((e) => ({
      userId: e.userId, userName: e.user.name, platform: e.platformSlug as PlatformSlug, status: effectiveAccess(e),
      active: enrollmentActive({ status: e.status, expiresAt: iso(e.expiresAt) }), source: e.source === "self" ? "self" as const : e.source, expiresAt: iso(e.expiresAt), createdAt: e.createdAt.toISOString(),
    }));
  },
};

/* ---------------- search ---------------- */

export const searchService: SearchService = {
  async search(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    const prisma = getPrisma();
    const contains = { contains: q, mode: "insensitive" as const };
    const [subjects, topics, materials] = await Promise.all([
      prisma.subject.findMany({ where: { ...visibleSubjectWhere, OR: [{ code: contains }, { name: contains }] }, include: { level: true }, take: 30 }),
      prisma.topic.findMany({ where: { ...visibleTopicWhere, title: contains }, include: { subject: true }, take: 30 }),
      prisma.material.findMany({ where: { ...visibleMaterialWhere, title: contains }, include: { subject: true }, take: 30 }),
    ]);
    return [
      ...subjects.map((s) => ({ kind: "subject" as const, id: s.slug, title: `${s.code} — ${s.name}`, context: s.level.platformSlug.toUpperCase(), href: routes.subject(s.slug) })),
      ...topics.map((t) => ({ kind: "topic" as const, id: t.id, title: t.title, context: t.subject.name, href: routes.topic(t.id) })),
      ...materials.map((m) => ({ kind: "material" as const, id: m.id, title: m.title, context: m.subject.name, href: m.topicId ? routes.topic(m.topicId) : routes.subject(m.subjectSlug) })),
    ].slice(0, 30);
  },
};

export { visibleTopicsOf, iso };
