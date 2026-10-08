import { z } from "zod";
import { difficulties, materialKinds } from "@/types";

/**
 * Admin form schemas — used by the browser form AND re-run by every server action.
 * Error messages are CODES ("required", "min:3", "range:1:100", …) resolved to translated text by
 * lib/validators/messages.ts, so one schema serves RU/EN/UZ and the server.
 */
const text = (min: number, max: number) =>
  z.string().trim().min(1, "required").min(min, `min:${min}`).max(max, `max:${max}`);
const optionalText = (max: number) => z.string().trim().max(max, `max:${max}`).optional().default("");
const int = (min: number, max: number) =>
  z.coerce.number({ message: `range:${min}:${max}` }).int(`range:${min}:${max}`).min(min, `range:${min}:${max}`).max(max, `range:${min}:${max}`);
const id = z.string().trim().min(1, "required").max(120, "invalidChoice");
const optionalId = z.string().trim().max(120, "invalidChoice").optional().default("");

export const platformSchema = z.object({ name: text(2, 20), fullName: text(3, 120), price: int(0, 100000) });

export const subjectSchema = z.object({ code: text(1, 12), name: text(3, 120), level: id });

export const topicSchema = z.object({
  title: text(3, 160),
  subject: id,
  description: optionalText(600),
  durationMinutes: int(1, 600),
  lessonCount: int(1, 50),
});

export const materialSchema = z
  .object({
    title: text(3, 160),
    kind: z.enum(materialKinds, { message: "invalidChoice" }),
    subject: id,
    topic: optionalId,
    body: z.string().max(20000, "max:20000").optional().default(""),
    fileId: z.string().trim().max(80).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "notes") {
      if (v.body.trim().length < 10) ctx.addIssue({ code: "custom", path: ["body"], message: "notesRequired" });
    } else if (!v.fileId) {
      ctx.addIssue({ code: "custom", path: ["fileId"], message: "fileRequired" });
    }
  });

/** "tag one, tag two" → validated list (at most 10 tags of 1–30 characters). */
const tagsField = z
  .string()
  .trim()
  .max(300, "max:300")
  .optional()
  .default("")
  .superRefine((v, ctx) => {
    const tags = v.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length > 10 || tags.some((t) => t.length > 30)) ctx.addIssue({ code: "custom", message: "tagsInvalid" });
  });

export const questionSchema = z.object({
  subject: id,
  topic: optionalId,
  text: text(10, 600),
  imageId: z.string().trim().max(80).optional().default(""),
  tags: tagsField,
  status: z.enum(["draft", "published"], { message: "invalidChoice" }),
  optionA: text(1, 300),
  optionB: text(1, 300),
  optionC: text(1, 300),
  optionD: text(1, 300),
  correct: z.enum(["a", "b", "c", "d"], { message: "invalidChoice" }),
  explanation: text(10, 800),
  points: int(1, 100),
  difficulty: z.enum(difficulties, { message: "invalidChoice" }),
});

export const testSchema = z.object({
  title: text(3, 160),
  description: optionalText(600),
  subject: id,
  topic: optionalId,
  durationMinutes: int(1, 240),
  passMark: int(1, 100),
  attemptsAllowed: int(0, 99),
  randomizeQuestions: z.boolean().default(false),
  randomizeAnswers: z.boolean().default(false),
  published: z.boolean().default(false),
  questionIds: z.array(z.string().max(120)).min(1, "questionsRequired").max(200, "invalidChoice"),
});

const email = z.string().trim().min(1, "required").email("emailInvalid").max(254, "emailInvalid");
const roles = ["STUDENT", "ADMIN"] as const;
const statuses = ["active", "suspended"] as const;

/** Password is mandatory when creating a user and optional (temporary reset) when editing. */
export const studentSchemaFor = (isNew: boolean) =>
  z
    .object({
      name: text(2, 80),
      email,
      role: z.enum(roles, { message: "invalidChoice" }),
      status: z.enum(statuses, { message: "invalidChoice" }),
      password: z.string().max(128, "passwordMin").optional().default(""),
    })
    .superRefine((v, ctx) => {
      const p = v.password;
      if (!p) {
        if (isNew) ctx.addIssue({ code: "custom", path: ["password"], message: "required" });
        return;
      }
      if (p.length < 8) ctx.addIssue({ code: "custom", path: ["password"], message: "passwordMin" });
      else if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) ctx.addIssue({ code: "custom", path: ["password"], message: "passwordStrength" });
    });

export const certificateSchema = z.object({ student: id, subject: id });

/** Grant / extend access: optional expiry as YYYY-MM-DD (empty = no expiry), never in the past. */
export const accessSchema = z.object({
  student: id,
  platform: z.enum(["acca", "fia"], { message: "invalidChoice" }),
  expiresAt: z.string().trim().max(10).optional().default("").superRefine((v, ctx) => {
    if (!v) return;
    const t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T23:59:59Z`) : NaN;
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) ctx.addIssue({ code: "custom", message: "dateInvalid" });
    else if (t < Date.now()) ctx.addIssue({ code: "custom", message: "datePast" });
  }),
});

export type PlatformForm = z.infer<typeof platformSchema>;
export type SubjectForm = z.infer<typeof subjectSchema>;
export type TopicForm = z.infer<typeof topicSchema>;
export type MaterialForm = z.infer<typeof materialSchema>;
export type QuestionForm = z.infer<typeof questionSchema>;
export type TestForm = z.infer<typeof testSchema>;
export type StudentForm = z.infer<ReturnType<typeof studentSchemaFor>>;

export const editableResources = ["platforms", "subjects", "topics", "materials", "question-bank", "tests", "students", "access", "certificates"] as const;
export type EditableResource = (typeof editableResources)[number];

export function schemaFor(resource: EditableResource, isNew: boolean) {
  switch (resource) {
    case "platforms": return platformSchema;
    case "subjects": return subjectSchema;
    case "topics": return topicSchema;
    case "materials": return materialSchema;
    case "question-bank": return questionSchema;
    case "tests": return testSchema;
    case "students": return studentSchemaFor(isNew);
    case "access": return accessSchema;
    case "certificates": return certificateSchema;
  }
}
