import type { Permission } from "@/lib/permissions";

export const resourceKeys = [
  "platforms",
  "subjects",
  "topics",
  "materials",
  "question-bank",
  "tests",
  "exams",
  "students",
  "payments",
] as const;
export type ResourceKey = (typeof resourceKeys)[number];

export type FieldKind = "text" | "email" | "textarea" | "number" | "select";

export interface FieldDef {
  name: string;
  kind: FieldKind;
  required?: boolean;
  min?: number;
  max?: number;
}

/** Declarative description of each admin list: which permission it needs and what its form edits. */
export const resourceConfig: Record<ResourceKey, { permission: Permission; fields: FieldDef[]; columns: string[] }> = {
  platforms: {
    permission: "manage_content",
    columns: ["name", "fullName", "levels", "subjects"],
    fields: [
      { name: "name", kind: "text", required: true, min: 2, max: 20 },
      { name: "fullName", kind: "text", required: true, min: 3, max: 120 },
    ],
  },
  subjects: {
    permission: "manage_content",
    columns: ["code", "name", "platform", "topics", "tests"],
    fields: [
      { name: "code", kind: "text", required: true, min: 1, max: 12 },
      { name: "name", kind: "text", required: true, min: 3, max: 120 },
      { name: "platform", kind: "select", required: true },
    ],
  },
  topics: {
    permission: "manage_content",
    columns: ["order", "title", "subject"],
    fields: [
      { name: "title", kind: "text", required: true, min: 3, max: 160 },
      { name: "subject", kind: "select", required: true },
    ],
  },
  materials: {
    permission: "manage_content",
    columns: ["title", "kind", "subject", "meta"],
    fields: [
      { name: "title", kind: "text", required: true, min: 3, max: 160 },
      { name: "kind", kind: "select", required: true },
      { name: "subject", kind: "select", required: true },
    ],
  },
  "question-bank": {
    permission: "manage_tests",
    columns: ["id", "text", "options"],
    fields: [
      { name: "text", kind: "textarea", required: true, min: 10, max: 600 },
      { name: "explanation", kind: "textarea", required: true, min: 10, max: 800 },
    ],
  },
  tests: {
    permission: "manage_tests",
    columns: ["title", "subject", "questions", "duration", "passMark"],
    fields: [
      { name: "title", kind: "text", required: true, min: 3, max: 160 },
      { name: "subject", kind: "select", required: true },
      { name: "duration", kind: "number", required: true, min: 1, max: 240 },
      { name: "passMark", kind: "number", required: true, min: 1, max: 100 },
    ],
  },
  exams: {
    permission: "manage_tests",
    columns: ["title", "platform", "startsAt", "duration", "status"],
    fields: [
      { name: "title", kind: "text", required: true, min: 3, max: 160 },
      { name: "platform", kind: "select", required: true },
      { name: "duration", kind: "number", required: true, min: 1, max: 360 },
    ],
  },
  students: {
    permission: "view_students",
    columns: ["name", "email", "role", "progress", "status"],
    fields: [
      { name: "name", kind: "text", required: true, min: 2, max: 80 },
      { name: "email", kind: "email", required: true },
      { name: "role", kind: "select", required: true },
    ],
  },
  payments: {
    permission: "manage_payments",
    columns: ["student", "description", "amount", "status", "date"],
    fields: [
      { name: "student", kind: "text", required: true, min: 2, max: 80 },
      { name: "amount", kind: "number", required: true, min: 1, max: 100000 },
    ],
  },
};
