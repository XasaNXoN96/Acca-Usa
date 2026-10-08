import * as React from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { services } from "@/services";
import { getStorage } from "@/services/storage";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { platformTheme } from "@/lib/platform-theme";
import { materialKinds, type PlatformSlug } from "@/types";
import type { FilterDef, ResourceRow } from "./resource-table";
import { QuestionPreview } from "./question-preview";
import { TestPreview } from "./test-preview";
import { CertificateDocument } from "@/features/certificates/certificate-document";
import type { Option } from "./record-form";
import type { ResourceKey } from "./resources";

export interface Built {
  rows: ResourceRow[];
  /** options for select / multiselect form fields, by field name */
  options: Record<string, Option[]>;
  /** options for list filters, by filter name */
  filters: Record<string, Option[]>;
}

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function mk(
  id: string, cells: ResourceRow["cells"], values: ResourceRow["values"], search: string[], label: string,
  archived: boolean, filter: Record<string, string> = {}, file?: ResourceRow["file"], preview?: React.ReactNode,
): ResourceRow {
  return { id, cells, values, search: search.join(" ").toLowerCase(), label, archived, filter, file, preview };
}

const bold = (text: string) => <span className="font-semibold">{text}</span>;
const platformBadge = (slug: PlatformSlug) => <Badge variant={platformTheme[slug].badge}>{slug.toUpperCase()}</Badge>;

export async function buildRows(resource: ResourceKey): Promise<Built> {
  const [locale, c, ts, kinds, platforms, subjects] = await Promise.all([
    getLocale(), getTranslations("common"), getTranslations("admin"), getTranslations("subject.materialKinds"),
    services.platforms.listAll(), services.subjects.listAll(),
  ]);
  const subjectOptions: Option[] = subjects.map((s) => ({ value: s.slug, label: `${s.code} — ${s.name}` }));
  const subjectCode = (slug: string) => subjects.find((s) => s.slug === slug)?.code ?? slug;
  const platformOptions: Option[] = platforms.map((p) => ({ value: p.slug, label: p.name }));

  switch (resource) {
    case "platforms":
      return {
        options: {}, filters: {},
        rows: platforms.map((p) =>
          mk(p.slug, {
            name: <span className="flex items-center gap-2">{platformBadge(p.slug)}{bold(p.name)}</span>,
            fullName: p.fullName, levels: p.levels.length, subjects: subjects.filter((s) => s.platform === p.slug && !s.archived).length,
          }, { name: p.name, fullName: p.fullName }, [p.name, p.fullName], p.name, !!p.archived),
        ),
      };

    case "subjects":
      return {
        options: { level: platforms.flatMap((p) => p.levels.map((l) => ({ value: l.id, label: `${p.name} — ${l.name}` }))) },
        filters: { platform: platformOptions },
        rows: subjects.map((s) =>
          mk(s.slug, {
            code: <Badge variant={platformTheme[s.platform].badge}>{s.code}</Badge>, name: bold(s.name), platform: platformBadge(s.platform),
            topics: s.topicCount, tests: s.testCount,
          }, { code: s.code, name: s.name, level: s.levelId }, [s.code, s.name, s.platform], `${s.code} ${s.name}`, !!s.archived, { platform: s.platform }),
        ),
      };

    case "topics": {
      const topics = await services.topics.listAll();
      return {
        options: { subject: subjectOptions }, filters: { subject: subjectOptions },
        rows: topics.map((x) =>
          mk(x.id, {
            order: x.order, title: bold(x.title), subject: <Badge variant="outline">{subjectCode(x.subjectSlug)}</Badge>, duration: c("minutes", { count: x.durationMinutes }),
          }, { title: x.title, subject: x.subjectSlug, description: x.description, durationMinutes: x.durationMinutes, lessonCount: x.lessonCount },
          [x.title, x.subjectSlug], x.title, x.archived, { subject: x.subjectSlug }),
        ),
      };
    }

    case "materials": {
      const [materials, topics] = await Promise.all([services.materials.listAll(), services.topics.listAll()]);
      const storage = getStorage();
      const kindOptions: Option[] = materialKinds.map((k) => ({ value: k, label: kinds(k) }));
      const topicName = (id?: string) => topics.find((x) => x.id === id)?.title ?? "—";
      const rows = await Promise.all(
        materials.map(async (m) => {
          const stored = m.fileId ? await storage.stat(m.fileId) : null;
          return mk(m.id, {
            title: bold(m.title), kind: <Badge variant="outline">{kinds(m.kind)}</Badge>, subject: subjectCode(m.subjectSlug), topic: topicName(m.topicId), meta: m.meta,
          }, { title: m.title, kind: m.kind, subject: m.subjectSlug, topic: m.topicId ?? "", body: m.body ?? "", fileId: m.fileId ?? "" },
          [m.title, m.kind, m.subjectSlug], m.title, !!m.archived, { kind: m.kind, subject: m.subjectSlug },
          stored ? { id: stored.id, name: stored.name, mime: stored.mime, size: stored.size } : undefined);
        }),
      );
      return {
        rows, filters: { kind: kindOptions, subject: subjectOptions },
        options: {
          kind: kindOptions, subject: subjectOptions,
          topic: [{ value: "", label: "—" }, ...topics.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.title, group: x.subjectSlug }))],
        },
      };
    }

    case "question-bank": {
      const [questions, topics] = await Promise.all([services.questions.list(), services.topics.listAll()]);
      const diff = (["easy", "medium", "hard"] as const).map((d) => ({ value: d, label: ts(`difficulty.${d}`) }));
      const tone = { easy: "success", medium: "warning", hard: "destructive" } as const;
      const statusTone = { draft: "warning", published: "success", archived: "neutral" } as const;
      const letters = (["a", "b", "c", "d"] as const).map((l) => ({ value: l, label: ts(`answer.${l}`) }));
      const statusFilter = (["draft", "published", "archived"] as const).map((x) => ({ value: x, label: ts(`questionStatus.${x}`) }));
      const formStatus = statusFilter.filter((x) => x.value !== "archived");
      const topicTitle = (id?: string) => topics.find((x) => x.id === id)?.title;
      const topicOptions = topics.filter((x) => !x.archived).map((x) => ({ value: x.id, label: `${subjectCode(x.subjectSlug)} · ${x.title}`, group: x.subjectSlug }));
      const platformOf = (slug: string) => subjects.find((x) => x.slug === slug)?.platform ?? "";
      return {
        options: { subject: subjectOptions, topic: [{ value: "", label: "—" }, ...topicOptions], correct: letters, difficulty: diff, status: formStatus },
        filters: { platform: platformOptions, subject: subjectOptions, topic: topicOptions, difficulty: diff, status: statusFilter },
        rows: await Promise.all(questions.map(async (q) => {
          const opt = (i: number) => q.options[i]?.text ?? "";
          return mk(q.id, {
            text: <span className="line-clamp-2 font-medium">{q.text}</span>, subject: subjectCode(q.subjectSlug), topic: topicTitle(q.topicId) ?? "—",
            difficulty: <Badge variant={tone[q.difficulty]}>{ts(`difficulty.${q.difficulty}`)}</Badge>, points: q.points,
            status: <Badge variant={statusTone[q.status]}>{ts(`questionStatus.${q.status}`)}</Badge>, updated: formatDate(q.updatedAt, locale),
          }, {
            subject: q.subjectSlug, topic: q.topicId ?? "", text: q.text, imageId: q.imageId ?? "", optionA: opt(0), optionB: opt(1), optionC: opt(2), optionD: opt(3),
            correct: q.correctOptionId, explanation: q.explanation, points: q.points, difficulty: q.difficulty,
            status: q.status === "archived" ? "draft" : q.status, tags: q.tags.join(", "),
          }, [q.text, q.subjectSlug, q.tags.join(" "), topicTitle(q.topicId) ?? "", q.explanation], clip(q.text, 60), !!q.archived,
          { platform: platformOf(q.subjectSlug), subject: q.subjectSlug, topic: q.topicId ?? "", difficulty: q.difficulty, status: q.status },
          q.imageId ? await (async () => { const f = await getStorage().stat(q.imageId!); return f ? { id: f.id, name: f.name, mime: f.mime, size: f.size } : undefined; })() : undefined,
          <QuestionPreview question={q} />);
        })),
      };
    }

    case "tests": {
      const [tests, questions, topics] = await Promise.all([services.tests.listAllForAdmin(), services.questions.list(), services.topics.listAll()]);
      const statusOf = (x: { archived?: boolean; published: boolean }) => (x.archived ? "archived" : x.published ? "published" : "draft") as "archived" | "published" | "draft";
      const statusFilter: Option[] = (["draft", "published", "archived"] as const).map((x) => ({ value: x, label: ts(`testStatus.${x}`) }));
      const statusTone = { draft: "neutral", published: "success", archived: "outline" } as const;
      const topicName = (id?: string) => topics.find((x) => x.id === id)?.title;
      const pickable = questions.filter((q) => q.status === "published");
      const platformOf = (slug: string) => subjects.find((x) => x.slug === slug)?.platform ?? "";
      return {
        filters: { platform: platformOptions, subject: subjectOptions, status: statusFilter },
        options: {
          subject: subjectOptions,
          topic: [{ value: "", label: "—" }, ...topics.filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.title, group: x.subjectSlug }))],
          questionIds: pickable.map((q) => ({
            value: q.id, label: clip(q.text, 80), group: q.subjectSlug,
            meta: { text: q.text, points: q.points, difficulty: q.difficulty, topic: topicName(q.topicId), tags: q.tags.join(" ") },
          })),
        },
        rows: tests.map((x) => {
          const status = statusOf(x);
          const qs = x.questionIds.flatMap((id) => questions.find((q) => q.id === id && q.status === "published" && !q.archived) ?? []);
          const row = mk(x.id, {
            title: <span className="flex flex-col"><span className="font-semibold">{x.title}</span>{topicName(x.topicId) ? <span className="type-caption text-muted-foreground">{topicName(x.topicId)}</span> : null}</span>,
            subject: subjectCode(x.subjectSlug), questions: x.questionCount, points: x.totalPoints, duration: c("minutes", { count: x.durationMinutes }), passMark: `${x.passMark}%`,
            attempts: x.attemptsAllowed === 0 ? "∞" : x.attemptsAllowed,
            status: <Badge variant={statusTone[status]}>{ts(`testStatus.${status}`)}</Badge>,
          }, {
            title: x.title, description: x.description, subject: x.subjectSlug, topic: x.topicId ?? "", durationMinutes: x.durationMinutes, passMark: x.passMark,
            attemptsAllowed: x.attemptsAllowed, randomizeQuestions: x.randomizeQuestions, randomizeAnswers: x.randomizeAnswers, published: x.published, questionIds: x.questionIds,
          }, [x.title, x.subjectSlug, x.description], x.title, !!x.archived,
          { platform: platformOf(x.subjectSlug), subject: x.subjectSlug, status },
          undefined,
          <TestPreview test={{
            title: x.title, description: x.description, durationMinutes: x.durationMinutes, passMark: x.passMark, attemptsAllowed: x.attemptsAllowed,
            questions: qs.map((q) => ({ id: q.id, text: q.text, options: q.options, points: q.points, imageId: q.imageId })),
          }} />);
          return { ...row, quick: x.archived ? undefined : { duplicate: true, publish: x.published ? ("unpublish" as const) : ("publish" as const) } };
        }),
      };
    }

    case "exams": {
      const [exams, es] = await Promise.all([services.exams.list(), getTranslations("exams")]);
      const variant = { scheduled: "info", open: "success", completed: "neutral" } as const;
      return {
        options: {}, filters: {},
        rows: exams.map((e) =>
          mk(e.id, {
            title: bold(e.title), platform: platformBadge(e.platform), startsAt: formatDateTime(e.startsAt, locale), duration: c("minutes", { count: e.durationMinutes }),
            status: <Badge variant={variant[e.status]}>{es(`status.${e.status}`)}</Badge>,
          }, {}, [e.title, e.platform], e.title, false),
        ),
      };
    }

    case "students": {
      const students = await services.users.listStudents();
      const roleOptions: Option[] = (["STUDENT", "ADMIN"] as const).map((r) => ({ value: r, label: ts(`roles.${r}`) }));
      const statusOptions: Option[] = (["active", "suspended"] as const).map((s) => ({ value: s, label: ts(`userStatus.${s}`) }));
      return {
        filters: { role: roleOptions, status: statusOptions }, options: { role: roleOptions, status: statusOptions },
        rows: students.map((u) =>
          mk(u.id, {
            name: bold(u.name), email: u.email, role: <Badge variant={u.role === "STUDENT" ? "neutral" : "navy"}>{ts(`roles.${u.role}`)}</Badge>,
            progress: u.role === "STUDENT" ? (
              <span className="flex min-w-28 items-center gap-2"><Progress value={u.progress} tone="navy" label={`${u.name} ${u.progress}%`} className="h-1.5 flex-1" /><span className="type-caption tabular-nums">{u.progress}%</span></span>
            ) : "—",
            status: <Badge variant={u.status === "active" ? "success" : "destructive"}>{ts(`userStatus.${u.status}`)}</Badge>,
          }, { name: u.name, email: u.email, role: u.role, status: u.status, password: "" }, [u.name, u.email, u.role], u.name, !!u.archived, { role: u.role, status: u.status }),
        ),
      };
    }

    case "certificates": {
      const [certs, students] = await Promise.all([services.certificates.listAll(), services.users.listStudents()]);
      const statusFilter: Option[] = (["issued", "revoked"] as const).map((x) => ({ value: x, label: ts(`certStatus.${x}`) }));
      const studentOptions: Option[] = students.filter((u) => u.role === "STUDENT" && !u.archived).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }));
      return {
        options: { student: studentOptions, subject: subjectOptions },
        filters: { platform: platformOptions, subject: subjectOptions, status: statusFilter },
        rows: certs.map((x) => ({
          ...mk(x.id, {
            number: <span className="font-mono font-semibold">{x.number}</span>, student: x.studentName, platform: platformBadge(x.platform), subject: `${x.subjectCode} — ${x.subjectName}`,
            issued: formatDate(x.issuedAt, locale), status: <Badge variant={x.status === "issued" ? "success" : "destructive"}>{ts(`certStatus.${x.status}`)}</Badge>,
          }, {}, [x.number, x.studentName, x.subjectCode, x.subjectName, x.platform], x.number, x.status === "revoked",
          { platform: x.platform, subject: x.subjectSlug, status: x.status }, undefined, <div className="space-y-3"><p className="type-caption text-muted-foreground">{ts(`certSource.${x.source}`)}</p><CertificateDocument cert={x} /></div>),
          noEdit: true,
        })),
      };
    }

    case "payments": {
      const [payments, ps] = await Promise.all([services.payments.listAll(), getTranslations("payments")]);
      const variant = { paid: "success", pending: "warning", refunded: "neutral", failed: "destructive" } as const;
      return {
        options: {}, filters: {},
        rows: payments.map((p) =>
          mk(p.id, {
            student: bold(p.studentName ?? "—"), description: p.description, amount: formatMoney(p.amountCents, p.currency, locale),
            status: <Badge variant={variant[p.status]}>{ps(`status.${p.status}`)}</Badge>, date: formatDate(p.createdAt, locale),
          }, {}, [p.studentName ?? "", p.description, p.status], p.description, false),
        ),
      };
    }
  }
}

export type { FilterDef };
