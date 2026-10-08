import type { Permission } from "@/lib/permissions";
import type { EditableResource } from "@/lib/validators/admin";

export const resourceKeys = ["platforms", "subjects", "topics", "materials", "question-bank", "tests", "exams", "students", "payments"] as const;
export type ResourceKey = (typeof resourceKeys)[number];

export type FieldKind = "text" | "email" | "textarea" | "number" | "select" | "multiselect" | "questionPicker" | "checkbox" | "password" | "file";

export interface FieldDef {
  name: string;
  kind: FieldKind;
  required?: boolean;
  /** options are filtered by the current value of this other field (options carry a `group`) */
  dependsOn?: string;
  /** render only while another field has one of these values */
  showIf?: { field: string; in?: string[]; notIn?: string[] };
  /** for kind "file": fixed upload kind (otherwise taken from the form's `kind` value) */
  fileKind?: string;
  /** initial value of a NEW record's field */
  default?: string;
}

export interface ResourceConfig {
  /** to open the page */
  permission: Permission;
  /** to create / edit / archive (undefined = read-only list) */
  editPermission?: Permission;
  columns: string[];
  fields: FieldDef[];
  /** filter names (options are supplied by the server builder) */
  filters: string[];
  canCreate: boolean;
}

export const resourceConfig: Record<ResourceKey, ResourceConfig> = {
  platforms: {
    permission: "manage_content", editPermission: "manage_content", canCreate: false, filters: [],
    columns: ["name", "fullName", "levels", "subjects"],
    fields: [{ name: "name", kind: "text", required: true }, { name: "fullName", kind: "text", required: true }],
  },
  subjects: {
    permission: "manage_content", editPermission: "manage_content", canCreate: true, filters: ["platform"],
    columns: ["code", "name", "platform", "topics", "tests"],
    fields: [{ name: "code", kind: "text", required: true }, { name: "name", kind: "text", required: true }, { name: "level", kind: "select", required: true }],
  },
  topics: {
    permission: "manage_content", editPermission: "manage_content", canCreate: true, filters: ["subject"],
    columns: ["order", "title", "subject", "duration"],
    fields: [
      { name: "title", kind: "text", required: true }, { name: "subject", kind: "select", required: true },
      { name: "description", kind: "textarea" }, { name: "durationMinutes", kind: "number", required: true }, { name: "lessonCount", kind: "number", required: true },
    ],
  },
  materials: {
    permission: "manage_content", editPermission: "manage_content", canCreate: true, filters: ["kind", "subject"],
    columns: ["title", "kind", "subject", "topic", "meta"],
    fields: [
      { name: "title", kind: "text", required: true }, { name: "kind", kind: "select", required: true },
      { name: "subject", kind: "select", required: true }, { name: "topic", kind: "select", dependsOn: "subject" },
      { name: "body", kind: "textarea", showIf: { field: "kind", in: ["notes"] } },
      { name: "fileId", kind: "file", showIf: { field: "kind", notIn: ["notes"] } },
    ],
  },
  "question-bank": {
    permission: "manage_tests", editPermission: "manage_tests", canCreate: true, filters: ["platform", "subject", "topic", "difficulty", "status"],
    columns: ["text", "subject", "topic", "difficulty", "points", "status", "updated"],
    fields: [
      { name: "subject", kind: "select", required: true }, { name: "topic", kind: "select", dependsOn: "subject" },
      { name: "text", kind: "textarea", required: true }, { name: "imageId", kind: "file", fileKind: "image" },
      { name: "optionA", kind: "text", required: true }, { name: "optionB", kind: "text", required: true },
      { name: "optionC", kind: "text", required: true }, { name: "optionD", kind: "text", required: true },
      { name: "correct", kind: "select", required: true }, { name: "explanation", kind: "textarea", required: true },
      { name: "points", kind: "number", required: true }, { name: "difficulty", kind: "select", required: true },
      { name: "status", kind: "select", required: true, default: "published" }, { name: "tags", kind: "text" },
    ],
  },
  tests: {
    permission: "manage_tests", editPermission: "manage_tests", canCreate: true, filters: ["platform", "subject", "status"],
    columns: ["title", "subject", "questions", "points", "duration", "passMark", "attempts", "status"],
    fields: [
      { name: "title", kind: "text", required: true }, { name: "description", kind: "textarea" },
      { name: "subject", kind: "select", required: true }, { name: "topic", kind: "select", dependsOn: "subject" },
      { name: "durationMinutes", kind: "number", required: true }, { name: "passMark", kind: "number", required: true },
      { name: "attemptsAllowed", kind: "number", required: true, default: "0" },
      { name: "randomizeQuestions", kind: "checkbox" }, { name: "randomizeAnswers", kind: "checkbox" },
      { name: "questionIds", kind: "questionPicker", required: true, dependsOn: "subject" },
      { name: "published", kind: "checkbox" },
    ],
  },
  exams: { permission: "manage_tests", canCreate: false, filters: [], columns: ["title", "platform", "startsAt", "duration", "status"], fields: [] },
  students: {
    permission: "view_students", editPermission: "manage_students", canCreate: true, filters: ["role", "status"],
    columns: ["name", "email", "role", "progress", "status"],
    fields: [
      { name: "name", kind: "text", required: true }, { name: "email", kind: "email", required: true },
      { name: "role", kind: "select", required: true }, { name: "status", kind: "select", required: true },
      { name: "password", kind: "password" },
    ],
  },
  payments: { permission: "manage_payments", canCreate: false, filters: [], columns: ["student", "description", "amount", "status", "date"], fields: [] },
};

export const isEditable = (r: ResourceKey): r is EditableResource & ResourceKey => !!resourceConfig[r].editPermission;
