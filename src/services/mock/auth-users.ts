import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AuthService, ServiceResult, UserInput, UserService } from "../contracts";
import type { StudentRecord, User } from "@/types";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getDb, newId, notifyAdmins, nowIso, pushNotification, type UserRec } from "./db";
import { activePlatformsOf, platformProgress } from "./calc";

export const toUser = (r: UserRec): User => ({
  id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, locale: r.locale, createdAt: r.createdAt,
});

const normEmail = (e: string) => e.trim().toLowerCase();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export { RESET_TTL_MINUTES } from "../auth-constants";
import { RESET_TTL_MINUTES } from "../auth-constants";
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;

export const authService: AuthService = {
  async register({ name, email, password, locale }) {
    const db = getDb();
    const e = normEmail(email);
    if (db.users.some((u) => u.email === e)) return { ok: false, code: "EMAIL_TAKEN", field: "email" };
    const rec: UserRec = {
      id: newId("u"), name: name.trim(), email: e, role: "STUDENT", status: "active", locale,
      passwordHash: await hashPassword(password), tokenVersion: 0, createdAt: nowIso(),
    };
    db.users.push(rec);
    pushNotification(db, rec.id, { code: "welcome", target: { kind: "none" } });
    notifyAdmins(db, { code: "user_registered", params: { name: rec.name }, target: { kind: "admin", path: "/admin/students" } });
    return { ok: true, data: toUser(rec) };
  },

  async verifyCredentials(email, password) {
    const rec = getDb().users.find((u) => u.email === normEmail(email) && !u.deletedAt);
    const ok = await verifyPassword(password, rec?.passwordHash);
    if (!rec || !ok) return { error: "INVALID" };
    if (rec.status !== "active") return { error: "SUSPENDED" };
    return { user: toUser(rec), tokenVersion: rec.tokenVersion };
  },

  async requestPasswordReset(email) {
    const db = getDb();
    const rec = db.users.find((u) => u.email === normEmail(email) && !u.deletedAt && u.status === "active");
    if (!rec) return null;
    db.resetTokens = db.resetTokens.filter((t) => t.userId !== rec.id && t.expiresAt > Date.now());
    const token = randomBytes(32).toString("base64url");
    db.resetTokens.push({ tokenHash: sha256(token), userId: rec.id, expiresAt: Date.now() + RESET_TTL_MS });
    return { token, user: { name: rec.name, email: rec.email, locale: rec.locale } };
  },

  async resetPassword(token, newPassword) {
    const db = getDb();
    const hash = sha256(token);
    const entry = db.resetTokens.find((t) => t.tokenHash === hash);
    if (!entry || entry.usedAt || entry.expiresAt < Date.now()) return false;
    const rec = db.users.find((u) => u.id === entry.userId && !u.deletedAt && u.status === "active");
    if (!rec) return false;
    rec.passwordHash = await hashPassword(newPassword);
    rec.tokenVersion += 1; // signs the user out everywhere
    entry.usedAt = Date.now();
    return true;
  },

  async getSessionUser(userId, tokenVersion) {
    const rec = getDb().users.find((u) => u.id === userId);
    if (!rec || rec.deletedAt || rec.status !== "active" || rec.tokenVersion !== tokenVersion) return null;
    return toUser(rec);
  },
};

export function sessionVersionOf(userId: string): number {
  return getDb().users.find((u) => u.id === userId)?.tokenVersion ?? 0;
}

function activeAdmins(excludeId?: string) {
  return getDb().users.filter((u) => u.role === "ADMIN" && u.status === "active" && !u.deletedAt && u.id !== excludeId).length;
}

export const userService: UserService = {
  async getById(id) {
    const r = getDb().users.find((u) => u.id === id && !u.deletedAt);
    return r ? toUser(r) : null;
  },

  async listStudents() {
    const db = getDb();
    return [...db.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map<StudentRecord>((u) => {
      const platforms = activePlatformsOf(db, u.id);
      const progress = platforms.length ? Math.round(platforms.reduce((a, p) => a + platformProgress(db, u.id, p), 0) / platforms.length) : 0;
      return { ...toUser(u), platforms, progress, archived: !!u.deletedAt };
    });
  },

  async create(input) {
    const db = getDb();
    const email = normEmail(input.email);
    if (db.users.some((u) => u.email === email)) return { ok: false, code: "EMAIL_TAKEN", field: "email" };
    const rec: UserRec = {
      id: newId("u"), name: input.name.trim(), email, role: input.role, status: input.status, locale: "en",
      passwordHash: await hashPassword(input.password), tokenVersion: 0, createdAt: nowIso(),
    };
    db.users.push(rec);
    return { ok: true, data: toUser(rec) };
  },

  async update(id, input: UserInput): Promise<ServiceResult<User>> {
    const db = getDb();
    const rec = db.users.find((u) => u.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    const email = normEmail(input.email);
    if (db.users.some((u) => u.id !== id && u.email === email)) return { ok: false, code: "EMAIL_TAKEN", field: "email" };
    const losingAdmin = rec.role === "ADMIN" && (input.role !== "ADMIN" || input.status !== "active");
    if (losingAdmin && activeAdmins(id) === 0) return { ok: false, code: "LAST_ADMIN" };
    const sensitive = rec.role !== input.role || rec.status !== input.status || !!input.password;
    rec.name = input.name.trim();
    rec.email = email;
    rec.role = input.role;
    rec.status = input.status;
    if (input.password) rec.passwordHash = await hashPassword(input.password);
    if (sensitive) rec.tokenVersion += 1;
    return { ok: true, data: toUser(rec) };
  },

  async setArchived(id, archived) {
    const db = getDb();
    const rec = db.users.find((u) => u.id === id);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    if (archived && rec.role === "ADMIN" && activeAdmins(id) === 0) return { ok: false, code: "LAST_ADMIN" };
    rec.deletedAt = archived ? nowIso() : undefined;
    rec.tokenVersion += 1;
    return { ok: true, data: undefined };
  },

  async updateProfile(userId, input) {
    const rec = getDb().users.find((u) => u.id === userId && !u.deletedAt);
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    rec.name = input.name.trim();
    rec.locale = input.locale;
    return { ok: true, data: undefined };
  },

  async updateLocale(userId, locale) {
    const rec = getDb().users.find((u) => u.id === userId);
    if (rec) rec.locale = locale;
  },
};
