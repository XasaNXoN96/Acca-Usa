import { z } from "zod";

/**
 * Validation messages are message KEYS (resolved in the UI via next-intl),
 * so the same schema serves the browser form and the server action in any language.
 */
export const authErrorKeys = [
  "required",
  "emailInvalid",
  "passwordMin",
  "passwordStrength",
  "nameMin",
  "passwordMismatch",
  "termsRequired",
] as const;
export type AuthErrorKey = (typeof authErrorKeys)[number];

const email = z.string().trim().min(1, "required").email("emailInvalid").max(254, "emailInvalid");
const password = z
  .string()
  .min(8, "passwordMin")
  .max(128, "passwordMin")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "passwordStrength");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "required"),
});
/** 6-digit authenticator code, or a recovery code (letters/digits, optionally grouped with dashes). */
export const mfaCodeSchema = z.object({ code: z.string().trim().min(6).max(24).regex(/^[A-Za-z0-9 -]+$/) });
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "nameMin").max(80, "nameMin"),
    email,
    password,
    confirmPassword: z.string().min(1, "required"),
    terms: z.boolean().refine((v) => v === true, "termsRequired"),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "passwordMismatch" });
export type RegisterInput = z.infer<typeof registerSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(2, "nameMin").max(80, "nameMin"),
  email,
  language: z.enum(["en", "ru", "uz"]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const forgotSchema = z.object({ email });
export type ForgotInput = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password,
    confirmPassword: z.string().min(1, "required"),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "passwordMismatch" });
export type ResetInput = z.infer<typeof resetSchema>;
