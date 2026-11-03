/**
 * Question bank import from a CSV file (pure — no database, so it is tested on its own).
 *   1. parseCsv()   RFC-4180 reader: quotes, "" escapes, line breaks inside quotes, delimiter `,` `;` or tab detected from the header, BOM removed
 *   2. mapQuestions() validates EVERY row with the same schema as the admin form and resolves subject (code or slug) and topic (title)
 * The result lists the valid questions and one error per bad row (line number + column + code); nothing is half-imported by this module.
 */
import { difficulties, type Difficulty } from "@/types";
import { questionSchema } from "@/lib/validators/admin";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "");
  const firstLine = src.slice(0, Math.max(0, src.search(/\r?\n/)) || src.length);
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let q = false;
  for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch as keyof typeof counts]++; }
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0] : ",") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Header aliases (lower-case, spaces / dashes / underscores removed) → internal column. English and Russian. */
const aliases: Record<string, string> = {
  subject: "subject", предмет: "subject", subjectcode: "subject",
  topic: "topic", тема: "topic",
  text: "text", question: "text", вопрос: "text", questiontext: "text",
  a: "a", optiona: "a", ответa: "a", вариантa: "a", "ответ1": "a", option1: "a",
  b: "b", optionb: "b", ответb: "b", вариантb: "b", "ответ2": "b", option2: "b",
  c: "c", optionc: "c", ответc: "c", вариантc: "c", "ответ3": "c", option3: "c",
  d: "d", optiond: "d", ответd: "d", вариантd: "d", "ответ4": "d", option4: "d",
  correct: "correct", answer: "correct", правильный: "correct", правильныйответ: "correct", верный: "correct",
  explanation: "explanation", пояснение: "explanation", объяснение: "explanation",
  points: "points", баллы: "points", балл: "points",
  difficulty: "difficulty", сложность: "difficulty",
  status: "status", статус: "status",
  tags: "tags", теги: "tags", метки: "tags",
};
const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_\-.]+/g, "");
const REQUIRED = ["subject", "text", "a", "b", "c", "d", "correct", "explanation"] as const;

export interface ImportError { line: number; column?: string; code: string }
export interface ImportContext {
  subjects: { slug: string; code: string }[];
  topics: { id: string; subjectSlug: string; title: string }[];
  /** existing questions, to skip duplicates when the same file is imported twice */
  existing: { subjectSlug: string; text: string }[];
}
export interface ImportedQuestion {
  line: number; subjectSlug: string; topicId?: string; text: string; options: [string, string, string, string]; correctIndex: 0 | 1 | 2 | 3;
  explanation: string; points: number; difficulty: Difficulty; status: "draft" | "published"; tags: string[];
}
export interface ImportPlan { questions: ImportedQuestion[]; errors: ImportError[]; duplicates: number[]; rows: number; fileProblem?: "EMPTY" | "NO_HEADER" | "MISSING_COLUMNS" | "TOO_MANY_ROWS"; missing?: string[] }

const letterIndex = (v: string): 0 | 1 | 2 | 3 | -1 => {
  const t = v.trim().toLowerCase();
  const m = ({ a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3, а: 0, в: 1, с: 2 } as Record<string, number>)[t]; // Cyrillic а / в / с look like latin a / b / c
  return m === undefined ? -1 : (m as 0 | 1 | 2 | 3);
};
const normText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function mapQuestions(rows: string[][], ctx: ImportContext): ImportPlan {
  if (rows.length === 0) return { questions: [], errors: [], duplicates: [], rows: 0, fileProblem: "EMPTY" };
  const header = rows[0]!.map((h) => aliases[norm(h)] ?? "");
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { questions: [], errors: [], duplicates: [], rows: rows.length - 1, fileProblem: "MISSING_COLUMNS", missing: [...missing] };
  const body = rows.slice(1);
  if (body.length === 0) return { questions: [], errors: [], duplicates: [], rows: 0, fileProblem: "EMPTY" };
  if (body.length > IMPORT_MAX_ROWS) return { questions: [], errors: [], duplicates: [], rows: body.length, fileProblem: "TOO_MANY_ROWS" };

  const col = (r: string[], name: string) => { const i = header.indexOf(name); return i < 0 ? "" : (r[i] ?? "").trim(); };
  const seen = new Set(ctx.existing.map((q) => `${q.subjectSlug}|${normText(q.text)}`));
  const out: ImportPlan = { questions: [], errors: [], duplicates: [], rows: body.length };

  body.forEach((r, idx) => {
    const line = idx + 2; // spreadsheet row number (1 = header)
    const err = (column: string, code: string) => out.errors.push({ line, column, code });
    const subjectRaw = col(r, "subject");
    const subject = ctx.subjects.find((s) => s.code.toLowerCase() === subjectRaw.toLowerCase() || s.slug.toLowerCase() === subjectRaw.toLowerCase());
    if (!subject) return err("subject", subjectRaw ? "SUBJECT_NOT_FOUND" : "required");
    const topicRaw = col(r, "topic");
    let topicId: string | undefined;
    if (topicRaw) {
      const t = ctx.topics.find((x) => x.subjectSlug === subject.slug && normText(x.title) === normText(topicRaw));
      if (!t) return err("topic", "TOPIC_NOT_FOUND");
      topicId = t.id;
    }
    const correctRaw = letterIndex(col(r, "correct"));
    if (correctRaw < 0) return err("correct", "CORRECT_INVALID");
    const correct = correctRaw as 0 | 1 | 2 | 3;
    const difficultyRaw = (col(r, "difficulty") || "medium").toLowerCase();
    const difficulty = (({ easy: "easy", medium: "medium", hard: "hard", легкий: "easy", лёгкий: "easy", средний: "medium", сложный: "hard" }) as Record<string, string>)[difficultyRaw];
    if (!difficulty || !(difficulties as readonly string[]).includes(difficulty)) return err("difficulty", "DIFFICULTY_INVALID");
    const statusRaw = (col(r, "status") || "draft").toLowerCase();
    const status = (({ draft: "draft", published: "published", черновик: "draft", опубликован: "published", опубликовано: "published" }) as Record<string, string>)[statusRaw];
    if (!status) return err("status", "STATUS_INVALID");
    const pointsRaw = col(r, "points");
    const points = pointsRaw === "" ? 1 : Number(pointsRaw);

    // The very same rules (lengths, ranges) as the admin form.
    const parsed = questionSchema.safeParse({
      subject: subject.slug, topic: topicId ?? "", text: col(r, "text"), imageId: "", tags: col(r, "tags"), status,
      optionA: col(r, "a"), optionB: col(r, "b"), optionC: col(r, "c"), optionD: col(r, "d"), correct: "abcd"[correct], explanation: col(r, "explanation"), points, difficulty,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0]!;
      const map: Record<string, string> = { text: "text", optionA: "a", optionB: "b", optionC: "c", optionD: "d", explanation: "explanation", points: "points", tags: "tags" };
      return err(map[String(first.path[0])] ?? String(first.path[0] ?? "row"), String(first.message));
    }
    const options = [col(r, "a"), col(r, "b"), col(r, "c"), col(r, "d")] as [string, string, string, string];
    if (new Set(options.map(normText)).size < 4) return err("a", "OPTIONS_NOT_UNIQUE");
    const key = `${subject.slug}|${normText(col(r, "text"))}`;
    if (seen.has(key)) { out.duplicates.push(line); return; }
    seen.add(key);
    out.questions.push({
      line, subjectSlug: subject.slug, topicId, text: col(r, "text"), options, correctIndex: correct, explanation: col(r, "explanation"),
      points, difficulty: difficulty as Difficulty, status: status as "draft" | "published",
      tags: col(r, "tags").split(/[,;]/).map((x) => x.trim()).filter(Boolean),
    });
  });
  return out;
}
