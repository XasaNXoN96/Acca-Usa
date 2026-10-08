import "server-only";
import type {
  EnrollmentService, MaterialInput, MaterialService, PlatformService, SearchService, SubjectService, TopicService,
} from "../contracts";
import type { Material, MaterialKind, Platform, PlatformSlug, Subject } from "@/types";
import { routes } from "@/lib/routes";
import { getStorage } from "../storage";
import { uploadKindFor, uploadRules } from "../storage/validation";
import {
  getDb, newId, nowIso, platformOfSubject, pushActivity, slugify, subjectVisible, topicVisible,
  type Db, type MaterialRec, type SubjectRec,
} from "./db";
import { platformProgress, subjectProgress, topicsWithStatus, visibleSubjects, visibleTopicsOf } from "./calc";

/* ---------------- platforms ---------------- */

function toPlatform(db: Db, slug: PlatformSlug): Platform | null {
  const p = db.platforms.find((x) => x.slug === slug);
  if (!p) return null;
  return {
    slug: p.slug, name: p.name, fullName: p.fullName, archived: !!p.deletedAt,
    levels: db.levels.filter((l) => l.platform === slug).sort((a, b) => a.order - b.order),
  };
}

export const platformService: PlatformService = {
  async list() {
    const db = getDb();
    return db.platforms.filter((p) => !p.deletedAt).flatMap((p) => toPlatform(db, p.slug) ?? []);
  },
  async listAll() {
    const db = getDb();
    return db.platforms.flatMap((p) => toPlatform(db, p.slug) ?? []);
  },
  async getBySlug(slug) {
    const db = getDb();
    const p = db.platforms.find((x) => x.slug === slug && !x.deletedAt);
    return p ? toPlatform(db, p.slug) : null;
  },
  async update(slug, input) {
    const p = getDb().platforms.find((x) => x.slug === slug);
    if (!p) return { ok: false, code: "NOT_FOUND" };
    p.name = input.name.trim();
    p.fullName = input.fullName.trim();
    return { ok: true, data: undefined };
  },
  async setArchived(slug, archived) {
    const db = getDb();
    const p = db.platforms.find((x) => x.slug === slug);
    if (!p) return { ok: false, code: "NOT_FOUND" };
    p.deletedAt = archived ? nowIso() : undefined;
    return { ok: true, data: undefined };
  },
};

/* ---------------- subjects ---------------- */

function toSubject(db: Db, s: SubjectRec): Subject {
  return {
    slug: s.slug, code: s.code, name: s.name, platform: platformOfSubject(db, s), levelId: s.levelId,
    topicCount: db.topics.filter((t) => t.subjectSlug === s.slug && !t.deletedAt).length,
    testCount: db.tests.filter((t) => t.subjectSlug === s.slug && !t.deletedAt && t.published).length,
    archived: !!s.deletedAt,
  };
}

export const subjectService: SubjectService = {
  async list() {
    const db = getDb();
    return visibleSubjects(db).map((s) => toSubject(db, s));
  },
  async listAll() {
    const db = getDb();
    return db.subjects.map((s) => toSubject(db, s));
  },
  async listByPlatform(slug) {
    const db = getDb();
    return visibleSubjects(db).filter((s) => platformOfSubject(db, s) === slug).map((s) => toSubject(db, s));
  },
  async getBySlug(slug) {
    const db = getDb();
    const s = db.subjects.find((x) => x.slug === slug);
    return subjectVisible(db, s) ? toSubject(db, s) : null;
  },
  async create(input) {
    const db = getDb();
    if (!db.levels.some((l) => l.id === input.levelId)) return { ok: false, code: "NOT_FOUND", field: "level" };
    let slug = slugify(input.code);
    for (let n = 2; db.subjects.some((s) => s.slug === slug); n++) slug = `${slugify(input.code)}-${n}`;
    const rec: SubjectRec = { slug, code: input.code.trim(), name: input.name.trim(), levelId: input.levelId, createdAt: nowIso() };
    db.subjects.push(rec);
    return { ok: true, data: toSubject(db, rec) };
  },
  async update(slug, input) {
    const db = getDb();
    const s = db.subjects.find((x) => x.slug === slug);
    if (!s) return { ok: false, code: "NOT_FOUND" };
    if (!db.levels.some((l) => l.id === input.levelId)) return { ok: false, code: "NOT_FOUND", field: "level" };
    s.code = input.code.trim();
    s.name = input.name.trim();
    s.levelId = input.levelId;
    return { ok: true, data: undefined };
  },
  async setArchived(slug, archived) {
    const s = getDb().subjects.find((x) => x.slug === slug);
    if (!s) return { ok: false, code: "NOT_FOUND" };
    s.deletedAt = archived ? nowIso() : undefined;
    return { ok: true, data: undefined };
  },
};

/* ---------------- materials ---------------- */

async function toMaterial(r: MaterialRec): Promise<Material> {
  const { deletedAt, ...rest } = r;
  let meta: string = r.kind === "notes" ? "Notes" : r.kind;
  let fileMime = r.fileMime;
  if (r.fileId) {
    const f = await getStorage().stat(r.fileId);
    if (f) {
      meta = `${formatSize(f.size)} · ${f.name.split(".").pop()?.toUpperCase() ?? ""}`;
      fileMime = f.mime;
    }
  }
  return { ...rest, meta, fileMime, archived: !!deletedAt };
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function materialVisible(db: Db, m: MaterialRec): boolean {
  if (m.deletedAt || !subjectVisible(db, db.subjects.find((s) => s.slug === m.subjectSlug))) return false;
  return !m.topicId || topicVisible(db, db.topics.find((t) => t.id === m.topicId));
}

async function checkMaterial(db: Db, input: MaterialInput): Promise<{ ok: false; code: string; field?: string } | null> {
  const subject = db.subjects.find((s) => s.slug === input.subjectSlug && !s.deletedAt);
  if (!subject) return { ok: false, code: "NOT_FOUND", field: "subject" };
  if (input.topicId) {
    const topic = db.topics.find((t) => t.id === input.topicId && !t.deletedAt);
    if (!topic || topic.subjectSlug !== input.subjectSlug) return { ok: false, code: "TOPIC_MISMATCH", field: "topic" };
  }
  if (input.kind === "notes") {
    if (!input.body?.trim()) return { ok: false, code: "NOTES_REQUIRED", field: "body" };
    return null;
  }
  if (!input.fileId) return { ok: false, code: "FILE_REQUIRED", field: "fileId" };
  const file = await getStorage().stat(input.fileId);
  if (!file) return { ok: false, code: "FILE_REQUIRED", field: "fileId" };
  const rule = uploadKindFor(input.kind);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!rule || !uploadRules[rule].exts.includes(ext)) return { ok: false, code: "FILE_TYPE", field: "fileId" };
  return null;
}

export const materialService: MaterialService = {
  async listForSubject(slug) {
    const db = getDb();
    return Promise.all(db.materials.filter((m) => m.subjectSlug === slug && materialVisible(db, m)).map(toMaterial));
  },
  async listAll() {
    return Promise.all(getDb().materials.map(toMaterial));
  },
  async getById(id) {
    const r = getDb().materials.find((m) => m.id === id);
    return r ? toMaterial(r) : null;
  },
  async create(input) {
    const db = getDb();
    const bad = await checkMaterial(db, input);
    if (bad) return bad;
    const rec: MaterialRec = {
      id: newId("mat"), subjectSlug: input.subjectSlug, topicId: input.topicId || undefined, kind: input.kind,
      title: input.title.trim(), fileId: input.kind === "notes" ? undefined : input.fileId,
      body: input.kind === "notes" ? input.body : undefined, createdAt: nowIso(),
    };
    db.materials.push(rec);
    if (rec.fileId) await getStorage().markAttached(rec.fileId, true);
    return { ok: true, data: await toMaterial(rec) };
  },
  async update(id, input) {
    const db = getDb();
    const rec = db.materials.find((m) => m.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    const bad = await checkMaterial(db, input);
    if (bad) return bad;
    const nextFile = input.kind === "notes" ? undefined : input.fileId;
    if (rec.fileId && rec.fileId !== nextFile) await getStorage().delete(rec.fileId); // replaced or removed
    if (nextFile && nextFile !== rec.fileId) await getStorage().markAttached(nextFile, true);
    Object.assign(rec, {
      title: input.title.trim(), kind: input.kind as MaterialKind, subjectSlug: input.subjectSlug,
      topicId: input.topicId || undefined, fileId: nextFile, body: input.kind === "notes" ? input.body : undefined,
    });
    return { ok: true, data: undefined };
  },
  async setArchived(id, archived) {
    const rec = getDb().materials.find((m) => m.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    rec.deletedAt = archived ? nowIso() : undefined;
    return { ok: true, data: undefined };
  },
};

/* ---------------- topics ---------------- */

export const topicService: TopicService = {
  async listPublic(subjectSlug) {
    const db = getDb();
    return visibleTopicsOf(db, subjectSlug).map((t, i) => ({
      id: t.id,
      order: i + 1,
      title: t.title,
      materials: db.materials
        .filter((m) => m.topicId === t.id && materialVisible(db, m))
        .map((m) => ({ id: m.id, title: m.title, kind: m.kind })),
    }));
  },
  async listForSubject(subjectSlug, userId) {
    return topicsWithStatus(getDb(), userId, subjectSlug);
  },
  async getContext(topicId, userId) {
    const db = getDb();
    const rec = db.topics.find((t) => t.id === topicId);
    if (!topicVisible(db, rec)) return null;
    const subRec = db.subjects.find((s) => s.slug === rec.subjectSlug);
    if (!subjectVisible(db, subRec)) return null;
    const list = topicsWithStatus(db, userId, rec.subjectSlug);
    const idx = list.findIndex((t) => t.id === topicId);
    const current = list[idx];
    if (!current) return null;
    const mats = await Promise.all(db.materials.filter((m) => m.topicId === topicId && materialVisible(db, m)).map(toMaterial));
    return { topic: current, subject: toSubject(db, subRec), previous: list[idx - 1] ?? null, next: list[idx + 1] ?? null, materials: mats };
  },
  async listAll() {
    return getDb().topics.map((t) => ({
      id: t.id, title: t.title, subjectSlug: t.subjectSlug, order: t.order, durationMinutes: t.durationMinutes,
      description: t.description, lessonCount: t.lessonCount, archived: !!t.deletedAt,
    }));
  },
  async create(input) {
    const db = getDb();
    if (!db.subjects.some((s) => s.slug === input.subjectSlug && !s.deletedAt)) return { ok: false, code: "NOT_FOUND", field: "subject" };
    let id = `${input.subjectSlug}-${slugify(input.title)}`;
    for (let n = 2; db.topics.some((t) => t.id === id); n++) id = `${input.subjectSlug}-${slugify(input.title)}-${n}`;
    const order = Math.max(0, ...db.topics.filter((t) => t.subjectSlug === input.subjectSlug).map((t) => t.order)) + 1;
    db.topics.push({
      id, subjectSlug: input.subjectSlug, order, title: input.title.trim(), lessonCount: input.lessonCount,
      durationMinutes: input.durationMinutes, description: input.description.trim(), keyPoints: [], createdAt: nowIso(),
    });
    return { ok: true, data: { id } };
  },
  async update(id, input) {
    const db = getDb();
    const rec = db.topics.find((t) => t.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    if (!db.subjects.some((s) => s.slug === input.subjectSlug && !s.deletedAt)) return { ok: false, code: "NOT_FOUND", field: "subject" };
    if (rec.subjectSlug !== input.subjectSlug) {
      rec.order = Math.max(0, ...db.topics.filter((t) => t.subjectSlug === input.subjectSlug).map((t) => t.order)) + 1;
      db.materials.filter((m) => m.topicId === id).forEach((m) => (m.subjectSlug = input.subjectSlug));
      db.tests.filter((t) => t.topicId === id).forEach((t) => (t.subjectSlug = input.subjectSlug));
    }
    Object.assign(rec, {
      title: input.title.trim(), subjectSlug: input.subjectSlug, description: input.description.trim(),
      durationMinutes: input.durationMinutes, lessonCount: input.lessonCount,
    });
    return { ok: true, data: undefined };
  },
  async setArchived(id, archived) {
    const rec = getDb().topics.find((t) => t.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    rec.deletedAt = archived ? nowIso() : undefined;
    return { ok: true, data: undefined };
  },
};

/* ---------------- enrolment ("My platforms") ---------------- */

export const enrollmentService: EnrollmentService = {
  async listForUser(userId) {
    const db = getDb();
    return db.platforms.filter((p) => !p.deletedAt).map((p) => {
      const active = db.enrollments.some((e) => e.userId === userId && e.platform === p.slug);
      return { platform: p.slug, status: active ? ("active" as const) : ("not_enrolled" as const), progress: active ? platformProgress(db, userId, p.slug) : 0 };
    });
  },
  async isEnrolled(userId, platform) {
    return getDb().enrollments.some((e) => e.userId === userId && e.platform === platform);
  },
  async enroll(userId, platform) {
    const db = getDb();
    const p = db.platforms.find((x) => x.slug === platform && !x.deletedAt);
    if (!p) return { ok: false, code: "NOT_FOUND" };
    if (!db.enrollments.some((e) => e.userId === userId && e.platform === platform)) {
      db.enrollments.push({ userId, platform, createdAt: nowIso() });
      pushActivity(db, { userId, kind: "enroll", title: p.name, context: p.fullName, href: routes.coursePlatform(platform) });
    }
    return { ok: true, data: undefined };
  },
  async leave(userId, platform) {
    const db = getDb();
    db.enrollments = db.enrollments.filter((e) => !(e.userId === userId && e.platform === platform));
    return { ok: true, data: undefined };
  },
};

/* ---------------- search ---------------- */

export const searchService: SearchService = {
  async search(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const db = getDb();
    const subjects = visibleSubjects(db);
    const subjectName = (slug: string) => db.subjects.find((s) => s.slug === slug)?.name ?? "";
    const hits = [
      ...subjects.filter((s) => `${s.code} ${s.name}`.toLowerCase().includes(q)).map((s) => ({
        kind: "subject" as const, id: s.slug, title: `${s.code} — ${s.name}`, context: platformOfSubject(db, s).toUpperCase(), href: routes.subject(s.slug),
      })),
      ...db.topics.filter((t) => topicVisible(db, t) && t.title.toLowerCase().includes(q)).map((t) => ({
        kind: "topic" as const, id: t.id, title: t.title, context: subjectName(t.subjectSlug), href: routes.topic(t.id),
      })),
      ...db.materials.filter((m) => materialVisible(db, m) && m.title.toLowerCase().includes(q)).map((m) => ({
        kind: "material" as const, id: m.id, title: m.title, context: subjectName(m.subjectSlug),
        href: m.topicId ? routes.topic(m.topicId) : routes.subject(m.subjectSlug),
      })),
    ];
    return hits.slice(0, 30);
  },
};

export { subjectProgress, visibleTopicsOf };
