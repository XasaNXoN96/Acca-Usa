import "server-only";
import type { MaterialService, PlatformService, SearchService, SubjectService, TopicService } from "../contracts";
import type { TopicStatus, TopicWithStatus } from "@/types";
import { allTopics, getSubject, getTopic, materials, platforms, subjects, topicsBySubject } from "@/data/mock/catalog";
import { getUserProgress } from "./store";
import { routes } from "@/lib/routes";

/** Sequential unlocking: completed topics + the first unfinished one are open; the rest are locked. */
function withStatus(subjectSlug: string, progress: Record<string, number>): TopicWithStatus[] {
  const topics = topicsBySubject[subjectSlug] ?? [];
  let currentFound = false;
  return topics.map((t) => {
    const p = progress[t.id] ?? 0;
    let status: TopicStatus;
    if (p >= 100) status = "completed";
    else if (!currentFound) {
      currentFound = true;
      status = p > 0 ? "in_progress" : "unlocked";
    } else status = "locked";
    return { ...t, progress: p, status };
  });
}

export const platformService: PlatformService = {
  async list() {
    return platforms;
  },
  async getBySlug(slug) {
    return platforms.find((p) => p.slug === slug) ?? null;
  },
};

export const subjectService: SubjectService = {
  async list() {
    return subjects;
  },
  async listByPlatform(slug) {
    return subjects.filter((s) => s.platform === slug);
  },
  async getBySlug(slug) {
    return getSubject(slug) ?? null;
  },
};

export const topicService: TopicService = {
  async listForSubject(subjectSlug, userId) {
    return withStatus(subjectSlug, getUserProgress(userId));
  },
  async getContext(topicId, userId) {
    const topic = getTopic(topicId);
    if (!topic) return null;
    const subject = getSubject(topic.subjectSlug);
    if (!subject) return null;
    const list = withStatus(topic.subjectSlug, getUserProgress(userId));
    const idx = list.findIndex((t) => t.id === topicId);
    const current = list[idx];
    if (!current) return null;
    return {
      topic: current,
      subject,
      previous: list[idx - 1] ?? null,
      next: list[idx + 1] ?? null,
      materials: materials.filter((m) => m.topicId === topicId),
    };
  },
  async listAll() {
    return allTopics.map((t) => ({ id: t.id, title: t.title, subjectSlug: t.subjectSlug, order: t.order }));
  },
};

export const materialService: MaterialService = {
  async listForSubject(slug) {
    return materials.filter((m) => m.subjectSlug === slug);
  },
  async listAll() {
    return materials;
  },
};

export const searchService: SearchService = {
  async search(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [
      ...subjects
        .filter((s) => `${s.code} ${s.name}`.toLowerCase().includes(q))
        .map((s) => ({
          kind: "subject" as const,
          id: s.slug,
          title: `${s.code} — ${s.name}`,
          context: s.platform.toUpperCase(),
          href: routes.subject(s.slug),
        })),
      ...allTopics
        .filter((t) => t.title.toLowerCase().includes(q))
        .map((t) => ({
          kind: "topic" as const,
          id: t.id,
          title: t.title,
          context: getSubject(t.subjectSlug)?.name ?? "",
          href: routes.topic(t.id),
        })),
      ...materials
        .filter((m) => m.title.toLowerCase().includes(q))
        .map((m) => ({
          kind: "material" as const,
          id: m.id,
          title: m.title,
          context: getSubject(m.subjectSlug)?.name ?? "",
          href: m.topicId ? routes.topic(m.topicId) : routes.subject(m.subjectSlug),
        })),
    ];
    return hits.slice(0, 30);
  },
};
