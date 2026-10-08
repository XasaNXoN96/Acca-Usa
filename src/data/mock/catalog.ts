/**
 * DEMO DATA — placeholder catalogue used until the database is connected.
 * Subject codes/names follow the public qualification structures; descriptions,
 * durations and counts are illustrative only.
 */
import type { Level, Material, Platform, PlatformSlug, Subject, Topic } from "@/types";

const lvl = (platform: PlatformSlug, order: number, name: string): Level => ({
  id: `${platform}-l${order}`,
  platform,
  name,
  order,
});

export const platforms: Platform[] = [
  {
    slug: "acca",
    name: "ACCA",
    fullName: "Association of Chartered Certified Accountants",
    levels: [
      lvl("acca", 1, "Applied Knowledge"),
      lvl("acca", 2, "Applied Skills"),
      lvl("acca", 3, "Strategic Professional"),
    ],
  },
  {
    slug: "cima",
    name: "CIMA",
    fullName: "Chartered Institute of Management Accountants",
    levels: [lvl("cima", 1, "Operational"), lvl("cima", 2, "Management"), lvl("cima", 3, "Strategic")],
  },
  {
    slug: "fia",
    name: "FIA",
    fullName: "Foundations in Accountancy",
    levels: [lvl("fia", 1, "Foundations in Accountancy")],
  },
];

type SubjectSeed = [slug: string, code: string, name: string, platform: PlatformSlug, level: number, topics: number, tests: number];

const seeds: SubjectSeed[] = [
  ["bt", "BT", "Business and Technology", "acca", 1, 6, 0],
  ["ma", "MA", "Management Accounting", "acca", 1, 7, 2],
  ["fa", "FA", "Financial Accounting", "acca", 1, 6, 0],
  ["lw", "LW", "Corporate and Business Law", "acca", 2, 4, 0],
  ["pm", "PM", "Performance Management", "acca", 2, 4, 0],
  ["tx", "TX", "Taxation", "acca", 2, 4, 0],
  ["fr", "FR", "Financial Reporting", "acca", 2, 4, 0],
  ["aa", "AA", "Audit and Assurance", "acca", 2, 4, 0],
  ["fm", "FM", "Financial Management", "acca", 2, 4, 0],
  ["sbl", "SBL", "Strategic Business Leader", "acca", 3, 4, 0],
  ["sbr", "SBR", "Strategic Business Reporting", "acca", 3, 4, 0],
  ["afm", "AFM", "Advanced Financial Management", "acca", 3, 4, 0],
  ["apm", "APM", "Advanced Performance Management", "acca", 3, 4, 0],
  ["atx", "ATX", "Advanced Taxation", "acca", 3, 4, 0],
  ["aaa", "AAA", "Advanced Audit and Assurance", "acca", 3, 4, 0],
  ["cima-e1", "E1", "Managing Finance in a Digital World", "cima", 1, 4, 0],
  ["cima-p1", "P1", "Management Accounting", "cima", 1, 4, 0],
  ["cima-f1", "F1", "Financial Reporting", "cima", 1, 4, 0],
  ["cima-e2", "E2", "Managing Performance", "cima", 2, 4, 0],
  ["cima-p2", "P2", "Advanced Management Accounting", "cima", 2, 4, 0],
  ["cima-f2", "F2", "Advanced Financial Reporting", "cima", 2, 4, 0],
  ["cima-e3", "E3", "Strategic Management", "cima", 3, 4, 0],
  ["cima-p3", "P3", "Risk Management", "cima", 3, 4, 0],
  ["cima-f3", "F3", "Financial Strategy", "cima", 3, 4, 0],
  ["fab", "FAB", "Accountant in Business", "fia", 1, 4, 0],
  ["fma", "FMA", "Management Accounting", "fia", 1, 4, 0],
  ["ffa", "FFA", "Financial Accounting", "fia", 1, 4, 0],
];

export const subjects: Subject[] = seeds.map(([slug, code, name, platform, level, topicCount, testCount]) => ({
  slug,
  code,
  name,
  platform,
  levelId: `${platform}-l${level}`,
  topicCount,
  testCount,
}));

const topicSeed = (subjectSlug: string, titles: [string, number, number, string][]): Topic[] =>
  titles.map(([title, lessonCount, durationMinutes, description], i) => ({
    id: `${subjectSlug}-${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}`,
    subjectSlug,
    order: i + 1,
    title,
    lessonCount,
    durationMinutes,
    description,
    keyPoints: [
      "Core definitions and terminology",
      "Worked examples step by step",
      "Typical exam question patterns",
      "Common mistakes to avoid",
    ],
  }));

const generic = (slug: string, count: number): Topic[] => {
  const base: [string, number, number, string][] = [
    ["Introduction and syllabus overview", 3, 40, "Orientation to the subject, its syllabus areas and the exam format."],
    ["Core concepts", 5, 75, "The foundational ideas you will rely on throughout the subject."],
    ["Applied techniques", 5, 90, "Techniques and calculations applied to realistic scenarios."],
    ["Exam technique and revision", 4, 60, "Approach, time management and a structured revision plan."],
  ];
  return topicSeed(slug, base.slice(0, count));
};

const maTopics = topicSeed("ma", [
  ["Introduction to management accounting", 4, 55, "The role of management accounting, users of information and how it differs from financial accounting."],
  ["Cost classification", 5, 70, "Classify costs by nature, function and behaviour, and understand why classification matters for decisions."],
  ["Cost accounting techniques", 6, 90, "Absorption and marginal costing, overhead apportionment and absorption."],
  ["Budgeting", 5, 80, "Purposes of budgets, budget preparation and the budgeting process."],
  ["Standard costing", 4, 65, "Setting standards and understanding how standard costs support control."],
  ["Variance analysis", 5, 85, "Calculate and interpret cost and revenue variances."],
  ["Performance measurement", 4, 60, "Financial and non-financial performance indicators and their limitations."],
]);

const btTopics = topicSeed("bt", [
  ["Business organisations and their stakeholders", 4, 55, "Types of organisation and the stakeholders they serve."],
  ["Business environment", 4, 60, "PESTEL and the external factors affecting organisations."],
  ["Organisational structure and culture", 4, 60, "Structures, culture and how they influence behaviour."],
  ["Governance, ethics and sustainability", 5, 75, "Corporate governance, professional ethics and sustainability."],
  ["Business functions and technology", 4, 65, "Functions of a business and the role of technology."],
  ["Communication and teamwork", 3, 45, "Effective communication, leadership and team dynamics."],
]);

const faTopics = topicSeed("fa", [
  ["The context and purpose of financial reporting", 3, 45, "Why organisations prepare financial statements and who uses them."],
  ["Double-entry bookkeeping", 5, 80, "Recording transactions using ledger accounts and the trial balance."],
  ["Sales and purchases", 4, 60, "Accounting for sales, purchases, returns and tax."],
  ["Non-current assets", 5, 70, "Acquisition, depreciation and disposal of non-current assets."],
  ["Accruals, prepayments and provisions", 4, 60, "Period-end adjustments and accounting for provisions."],
  ["Preparing financial statements", 6, 95, "Statement of profit or loss and statement of financial position."],
]);

const dedicated: Record<string, Topic[]> = { ma: maTopics, bt: btTopics, fa: faTopics };

export const topicsBySubject: Record<string, Topic[]> = Object.fromEntries(
  subjects.map((s) => [s.slug, dedicated[s.slug] ?? generic(s.slug, s.topicCount)]),
);

export const allTopics: Topic[] = Object.values(topicsBySubject).flat();

/** Seed notes only — real files are uploaded through the demo storage provider. */
export const materials: Material[] = [
  ...maTopics.map<Material>((t) => ({
    id: `${t.id}-notes`,
    subjectSlug: "ma",
    topicId: t.id,
    kind: "notes",
    title: `${t.title} — study notes`,
    meta: "Notes",
    body: `${t.description}\n\n${t.keyPoints.map((k) => `• ${k}`).join("\n")}`,
    createdAt: "2026-01-10T10:00:00.000Z",
  })),
  {
    id: "ma-cost-classification-workbook",
    subjectSlug: "ma",
    topicId: "ma-cost-classification",
    kind: "pdf",
    title: "Cost classification — sample workbook",
    meta: "PDF",
    fileId: "seed-ma-workbook",
    fileMime: "application/pdf",
    createdAt: "2026-01-10T10:00:00.000Z",
  },
];

export const getPlatform = (slug: string) => platforms.find((p) => p.slug === slug);
export const getSubject = (slug: string) => subjects.find((s) => s.slug === slug);
export const getTopic = (id: string) => allTopics.find((t) => t.id === id);
