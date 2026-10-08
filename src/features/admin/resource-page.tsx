import * as React from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DemoBadge } from "@/components/ui/demo-badge";
import { Progress } from "@/components/ui/progress";
import { ErrorState } from "@/components/ui/states";
import type { DataColumn } from "@/components/ui/data-table";
import { AdminResourceTable, type ResolvedField, type ResourceRow } from "./resource-table";
import { resourceConfig, type ResourceKey } from "./resources";
import { services } from "@/services";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { platformTheme } from "@/lib/platform-theme";
import type { PlatformSlug } from "@/types";

type Built = { rows: ResourceRow[]; options: Record<string, { value: string; label: string }[]> };

const row = (id: string, cells: ResourceRow["cells"], values: Record<string, string>, search: string[]): ResourceRow => ({
  id,
  cells,
  values,
  search: search.join(" ").toLowerCase(),
});

export async function AdminResourcePage({ resource }: { resource: ResourceKey }) {
  const [t, c, ts, locale, session] = await Promise.all([
    getTranslations("admin.resources"),
    getTranslations("common"),
    getTranslations("admin"),
    getLocale(),
    services.auth.getSession("ADMIN"),
  ]);
  const cfg = resourceConfig[resource];
  // Prepared for Auth.js: the same check will run in the server layer of the real service.
  const allowed = can(session.user.role, cfg.permission);
  const title = t(`${resource}.title`);

  const [platforms, subjects] = await Promise.all([services.platforms.list(), services.subjects.list()]);
  const platformOptions = platforms.map((p) => ({ value: p.slug, label: p.name }));
  const subjectOptions = subjects.map((s) => ({ value: s.slug, label: `${s.code} — ${s.name}` }));
  const subjectName = (slug: string) => subjects.find((s) => s.slug === slug)?.code ?? slug;
  const platformBadge = (slug: PlatformSlug) => <Badge variant={platformTheme[slug].badge}>{slug.toUpperCase()}</Badge>;

  const build = async (): Promise<Built> => {
    switch (resource) {
      case "platforms":
        return {
          options: {},
          rows: platforms.map((p) =>
            row(p.slug, {
              name: <span className="font-semibold">{platformBadge(p.slug)} {p.name}</span>,
              fullName: p.fullName,
              levels: p.levels.length,
              subjects: subjects.filter((s) => s.platform === p.slug).length,
            }, { name: p.name, fullName: p.fullName }, [p.name, p.fullName]),
          ),
        };
      case "subjects":
        return {
          options: { platform: platformOptions },
          rows: subjects.map((s) =>
            row(s.slug, {
              code: <Badge variant={platformTheme[s.platform].badge}>{s.code}</Badge>,
              name: <span className="font-semibold">{s.name}</span>,
              platform: platformBadge(s.platform),
              topics: s.topicCount,
              tests: s.testCount,
            }, { code: s.code, name: s.name, platform: s.platform }, [s.code, s.name, s.platform]),
          ),
        };
      case "topics": {
        const topics = await services.topics.listAll();
        return {
          options: { subject: subjectOptions },
          rows: topics.map((x) =>
            row(x.id, { order: x.order, title: <span className="font-semibold">{x.title}</span>, subject: <Badge variant="outline">{subjectName(x.subjectSlug)}</Badge> },
              { title: x.title, subject: x.subjectSlug }, [x.title, x.subjectSlug]),
          ),
        };
      }
      case "materials": {
        const [materials, kinds] = await Promise.all([services.materials.listAll(), getTranslations("subject.materialKinds")]);
        const kindOptions = (["video", "pdf", "notes", "audio", "slides", "book"] as const).map((k) => ({ value: k, label: kinds(k) }));
        return {
          options: { kind: kindOptions, subject: subjectOptions },
          rows: materials.map((m) =>
            row(m.id, { title: <span className="font-semibold">{m.title}</span>, kind: <Badge variant="outline">{kinds(m.kind)}</Badge>, subject: subjectName(m.subjectSlug), meta: m.meta },
              { title: m.title, kind: m.kind, subject: m.subjectSlug }, [m.title, m.kind, m.subjectSlug]),
          ),
        };
      }
      case "question-bank": {
        const qs = await services.tests.listQuestions();
        return {
          options: {},
          rows: qs.map((q) => row(q.id, { id: <code className="type-caption">{q.id}</code>, text: q.text, options: q.options }, { text: q.text, explanation: "" }, [q.id, q.text])),
        };
      }
      case "tests": {
        const tests = await services.tests.listAll();
        return {
          options: { subject: subjectOptions },
          rows: tests.map((x) =>
            row(x.id, {
              title: <span className="font-semibold">{x.title}</span>,
              subject: subjectName(x.subjectSlug),
              questions: x.questionCount,
              duration: c("minutes", { count: x.durationMinutes }),
              passMark: `${x.passMark}%`,
            }, { title: x.title, subject: x.subjectSlug, duration: String(x.durationMinutes), passMark: String(x.passMark) }, [x.title, x.subjectSlug]),
          ),
        };
      }
      case "exams": {
        const [exams, es] = await Promise.all([services.exams.list(), getTranslations("exams")]);
        const variant = { scheduled: "info", open: "success", completed: "neutral" } as const;
        return {
          options: { platform: platformOptions },
          rows: exams.map((e) =>
            row(e.id, {
              title: <span className="font-semibold">{e.title}</span>,
              platform: platformBadge(e.platform),
              startsAt: formatDateTime(e.startsAt, locale),
              duration: c("minutes", { count: e.durationMinutes }),
              status: <Badge variant={variant[e.status]}>{es(`status.${e.status}`)}</Badge>,
            }, { title: e.title, platform: e.platform, duration: String(e.durationMinutes) }, [e.title, e.platform]),
          ),
        };
      }
      case "students": {
        const students = await services.users.listStudents();
        const roleOptions = (["STUDENT", "TEACHER", "ADMIN"] as const).map((r) => ({ value: r, label: ts(`roles.${r}`) }));
        return {
          options: { role: roleOptions },
          rows: students.map((u) =>
            row(u.id, {
              name: <span className="font-semibold">{u.name}</span>,
              email: u.email,
              role: <Badge variant={u.role === "STUDENT" ? "neutral" : "navy"}>{ts(`roles.${u.role}`)}</Badge>,
              progress: u.role === "STUDENT" ? (
                <span className="flex min-w-28 items-center gap-2"><Progress value={u.progress} tone="navy" label={`${u.name} ${u.progress}%`} className="h-1.5 flex-1" /><span className="type-caption tabular-nums">{u.progress}%</span></span>
              ) : "—",
              status: <Badge variant={u.status === "active" ? "success" : "destructive"}>{ts(`userStatus.${u.status}`)}</Badge>,
            }, { name: u.name, email: u.email, role: u.role }, [u.name, u.email, u.role]),
          ),
        };
      }
      case "payments": {
        const [payments, ps] = await Promise.all([services.payments.listAll(), getTranslations("payments")]);
        const variant = { paid: "success", pending: "warning", refunded: "neutral", failed: "destructive" } as const;
        return {
          options: {},
          rows: payments.map((p) =>
            row(p.id, {
              student: <span className="font-semibold">{p.studentName ?? "—"}</span>,
              description: p.description,
              amount: formatMoney(p.amountCents, p.currency, locale),
              status: <Badge variant={variant[p.status]}>{ps(`status.${p.status}`)}</Badge>,
              date: formatDate(p.createdAt, locale),
            }, { student: p.studentName ?? "", amount: String(p.amountCents / 100) }, [p.studentName ?? "", p.description, p.status]),
          ),
        };
      }
    }
  };

  if (!allowed) {
    const s = await getTranslations("states");
    return (
      <>
        <PageHeader title={title} />
        <ErrorState title={s("forbiddenTitle")} description={s("forbiddenText")} />
      </>
    );
  }

  const built = await build();
  const numericColumns = new Set(["amount", "progress", "topics", "tests", "questions", "levels", "subjects", "options", "order"]);
  const columns: DataColumn[] = cfg.columns.map((key, i) => ({
    key,
    header: t(`${resource}.columns.${key}` as never),
    align: numericColumns.has(key) && key !== "progress" ? "right" : "left",
    mobile: i === 0 ? "title" : "row",
  }));
  const fields: ResolvedField[] = cfg.fields.map((fd) => ({
    ...fd,
    label: t(`${resource}.fields.${fd.name}` as never),
    options: built.options[fd.name],
  }));

  return (
    <>
      <PageHeader title={title} description={t(`${resource}.description`)} actions={<DemoBadge />} />
      <AdminResourceTable
        columns={columns}
        rows={built.rows}
        fields={fields}
        addLabel={t(`${resource}.add`)}
        tableCaption={title}
        canEdit={can(session.user.role, resource === "students" ? "manage_students" : cfg.permission)}
      />
    </>
  );
}
