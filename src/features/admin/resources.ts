import type { Permission } from "@/lib/permissions";
import type { EditableResource } from "@/lib/validators/admin";

export const resourceKeys = ["platforms", "subjects", "topics", "materials", "question-bank", "tests", "exams", "students", "access", "certificates", "payments"] as const;
export type ResourceKey = (typeof resourceKeys)[number];

export type FieldKind = "text" | "email" | "textarea" | "number" | "select" | "multiselect" | "questionPicker" | "checkbox" | "password" | "file" | "date" | "datetime";

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
  /** the "archive" action means something else here (certificates: revoke) — labels come from <resource>.labels.* */
  customArchiveLabels?: boolean;
}

export const resourceConfig: Record<ResourceKey, ResourceConfig> = {
  platforms: {
    permission: "manage_content", editPermission: "manage_content", canCreate: false, filters: [],
    columns: ["name", "fullName", "price", "levels", "subjects"],
    fields: [{ name: "name", kind: "text", required: true }, { name: "fullName", kind: "text", required: true }, { name: "price", kind: "number", required: true, default: "0" }],
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
      { name: "visibility", kind: "select", required: true, default: "published" },
      { name: "publishAt", kind: "date", showIf: { field: "visibility", in: ["scheduled"] } },
      { name: "position", kind: "number", default: "0" },
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
  exams: {
    permission: "manage_tests", editPermission: "manage_tests", canCreate: true, filters: ["subject", "status"],
    columns: ["title", "subject", "questions", "window", "duration", "passMark", "attempts", "status"],
    fields: [
      { name: "title", kind: "text", required: true }, { name: "description", kind: "textarea" },
      { name: "subject", kind: "select", required: true },
      { name: "durationMinutes", kind: "number", required: true }, { name: "passMark", kind: "number", required: true, default: "70" },
      { name: "attemptsAllowed", kind: "number", required: true, default: "1" },
      { name: "opensAt", kind: "datetime" }, { name: "closesAt", kind: "datetime" },
      { name: "reviewPolicy", kind: "select", required: true, default: "IMMEDIATE" },
      { name: "randomizeQuestions", kind: "checkbox" }, { name: "randomizeAnswers", kind: "checkbox" },
      { name: "questionIds", kind: "questionPicker", required: true, dependsOn: "subject" },
      { name: "published", kind: "checkbox" },
    ],
  },
  students: {
    permission: "view_students", editPermission: "manage_students", canCreate: true, filters: ["role", "status"],
    columns: ["name", "email", "role", "progress", "status"],
    fields: [
      { name: "name", kind: "text", required: true }, { name: "email", kind: "email", required: true },
      { name: "role", kind: "select", required: true }, { name: "status", kind: "select", required: true },
      { name: "password", kind: "password" },
    ],
  },
  access: {
    permission: "view_students", editPermission: "manage_students", canCreate: true, filters: ["platform", "status"], customArchiveLabels: true,
    columns: ["student", "platform", "status", "source", "expires"],
    fields: [{ name: "student", kind: "select", required: true }, { name: "platform", kind: "select", required: true }, { name: "expiresAt", kind: "text" }],
  },
  certificates: {
    permission: "view_students", editPermission: "manage_students", canCreate: true, filters: ["platform", "subject", "status"], customArchiveLabels: true,
    columns: ["number", "student", "platform", "subject", "issued", "status"],
    fields: [{ name: "student", kind: "select", required: true }, { name: "subject", kind: "select", required: true }],
  },
  payments: { permission: "manage_payments", canCreate: false, filters: ["status", "platform"], columns: ["student", "description", "amount", "status", "provider", "date"], fields: [] },
};

export const isEditable = (r: ResourceKey): r is EditableResource & ResourceKey => !!resourceConfig[r].editPermission;
