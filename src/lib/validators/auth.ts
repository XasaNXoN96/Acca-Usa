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
  "passwordCommon",
  "nameMin",
  "passwordMismatch",
  "termsRequired",
  "privacyRequired",
] as const;
export type AuthErrorKey = (typeof authErrorKeys)[number];

/** The most guessed passwords (lower-case). Letters + digits alone is not enough: "password1" passes that rule and is tried first by every attacker. */
const COMMON_PASSWORDS = new Set([
  "password1", "password12", "password123", "password1234", "password12345", "password123456", "passw0rd", "passw0rd1", "p@ssw0rd", "p@ssword1",
  "qwerty123", "qwerty1234", "qwerty12345", "qwertyuiop1", "qwerty1", "1qaz2wsx", "1q2w3e4r", "1q2w3e4r5t", "q1w2e3r4", "q1w2e3r4t5", "zaq12wsx",
  "abc12345", "abcd1234", "abcde12345", "abc123456", "a1b2c3d4", "a12345678", "aa123456", "aa12345678", "asdf1234", "asdfghjk1", "zxcvbnm123",
  "iloveyou1", "iloveyou123", "welcome1", "welcome123", "admin123", "admin1234", "admin12345", "administrator1", "letmein123", "monkey123", "dragon123",
  "football1", "football123", "baseball1", "master123", "sunshine1", "princess1", "shadow123", "superman1", "michael123", "charlie123", "trustno1",
  "login1234", "changeme1", "changeme123", "test1234", "test12345", "testtest1", "user1234", "student123", "student1234", "acca12345", "acca2024", "acca2025", "acca2026",
  "uzbekistan1", "tashkent123", "salom123", "salom1234", "parol123", "parol1234", "parol12345", "ghbdtn123", "yfpfhf123", "123456789a", "12345678a", "1234567a", "a1234567",
]);

/** Shared by the registration, reset and admin forms. */
export const isCommonPassword = (v: string) => COMMON_PASSWORDS.has(v.toLowerCase()) || /^(.)\1+\d*$/.test(v.toLowerCase());

const email = z.string().trim().min(1, "required").email("emailInvalid").max(254, "emailInvalid");
const password = z
  .string()
  .min(8, "passwordMin")
  .max(128, "passwordMin")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "passwordStrength")
  .refine((v) => !isCommonPassword(v), "passwordCommon");

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
    /** separate, explicit consent to the processing of personal data (not bundled with the terms) */
    privacy: z.boolean().refine((v) => v === true, "privacyRequired"),
    marketing: z.boolean().optional(),
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
