import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { User as DbUser } from "@prisma/client";
import type { AuthService, ServiceResult, UserInput, UserService } from "../contracts";
import type { StudentRecord, User } from "@/types";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getPrisma } from "@/lib/prisma";
import { platformProgress } from "../domain/calc";
import { notifyAdmins, notifyUser } from "./events";
import { loadCalcDbForRead } from "./load";

export const toUser = (r: DbUser): User => ({
  id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, locale: r.locale, createdAt: r.createdAt.toISOString(),
});

const normEmail = (e: string) => e.trim().toLowerCase();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export { RESET_TTL_MINUTES } from "../auth-constants";
import { RESET_TTL_MINUTES } from "../auth-constants";
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;
const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export const authService: AuthService = {
  async register({ name, email, password, locale }) {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(password);
    try {
      const rec = await prisma.user.create({ data: { name: name.trim(), email: normEmail(email), passwordHash, role: "STUDENT", locale } });
      await notifyUser(rec.id, { code: "welcome", target: { kind: "none" } });
      await notifyAdmins({ code: "user_registered", params: { name: rec.name }, target: { kind: "admin", path: "/admin/students" } });
      return { ok: true, data: toUser(rec) };
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, code: "EMAIL_TAKEN", field: "email" };
      throw e;
    }
  },

  async verifyCredentials(email, password) {
    const rec = await getPrisma().user.findFirst({ where: { email: normEmail(email), deletedAt: null } });
    const ok = await verifyPassword(password, rec?.passwordHash); // constant-ish work even for unknown e-mails
    if (!rec || !ok) return { error: "INVALID" };
    if (rec.status !== "active") return { error: "SUSPENDED" };
    return { user: toUser(rec), tokenVersion: rec.tokenVersion };
  },

  async requestPasswordReset(email) {
    const prisma = getPrisma();
    const rec = await prisma.user.findFirst({ where: { email: normEmail(email), deletedAt: null, status: "active" } });
    if (!rec) return null;
    const token = randomBytes(32).toString("base64url");
    await prisma.$transaction([
      prisma.resetToken.deleteMany({ where: { userId: rec.id } }),
      prisma.resetToken.create({ data: { tokenHash: sha256(token), userId: rec.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
    ]);
    return { token, user: { name: rec.name, email: rec.email, locale: rec.locale } };
  },

  async resetPassword(token, newPassword) {
    const prisma = getPrisma();
    const hash = sha256(token);
    const passwordHash = await hashPassword(newPassword);
    // Single-use: the conditional update succeeds for exactly one caller, even under concurrent requests.
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.resetToken.updateMany({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) return false;
      const entry = await tx.resetToken.findUnique({ where: { tokenHash: hash } });
      const user = entry && (await tx.user.findFirst({ where: { id: entry.userId, deletedAt: null, status: "active" } }));
      if (!user) return false;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } }); // signs out everywhere
      return true;
    });
  },

  async getSessionUser(userId, tokenVersion) {
    const rec = await getPrisma().user.findUnique({ where: { id: userId } });
    if (!rec || rec.deletedAt || rec.status !== "active" || rec.tokenVersion !== tokenVersion) return null;
    return toUser(rec);
  },
};

export async function sessionVersionOf(userId: string): Promise<number> {
  return (await getPrisma().user.findUnique({ where: { id: userId }, select: { tokenVersion: true } }))?.tokenVersion ?? 0;
}

const activeAdminsExcept = (id: string) => getPrisma().user.count({ where: { role: "ADMIN", status: "active", deletedAt: null, id: { not: id } } });

export const userService: UserService = {
  async getById(id) {
    const r = await getPrisma().user.findFirst({ where: { id, deletedAt: null } });
    return r ? toUser(r) : null;
  },

  async listStudents() {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { enrollments: { where: { status: { in: ["FREE", "ACTIVE"] } }, select: { platformSlug: true } } } });
    const calc = await loadCalcDbForRead("all");
    return users.map<StudentRecord>((u) => {
      const platforms = u.enrollments.map((e) => e.platformSlug as StudentRecord["platforms"][number]);
      const progress = platforms.length ? Math.round(platforms.reduce((a, p) => a + platformProgress(calc, u.id, p), 0) / platforms.length) : 0;
      return { ...toUser(u), platforms, progress, archived: !!u.deletedAt };
    });
  },

  async create(input) {
    try {
      const rec = await getPrisma().user.create({
        data: { name: input.name.trim(), email: normEmail(input.email), role: input.role, status: input.status, passwordHash: await hashPassword(input.password) },
      });
      return { ok: true, data: toUser(rec) };
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, code: "EMAIL_TAKEN", field: "email" };
      throw e;
    }
  },

  async update(id, input: UserInput): Promise<ServiceResult<User>> {
    const prisma = getPrisma();
    const rec = await prisma.user.findUnique({ where: { id } });
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    const losingAdmin = rec.role === "ADMIN" && (input.role !== "ADMIN" || input.status !== "active");
    if (losingAdmin && (await activeAdminsExcept(id)) === 0) return { ok: false, code: "LAST_ADMIN" };
    const sensitive = rec.role !== input.role || rec.status !== input.status || !!input.password;
    try {
      const next = await prisma.user.update({
        where: { id },
        data: {
          name: input.name.trim(), email: normEmail(input.email), role: input.role, status: input.status,
          ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
          ...(sensitive ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
      return { ok: true, data: toUser(next) };
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, code: "EMAIL_TAKEN", field: "email" };
      throw e;
    }
  },

  async setArchived(id, archived) {
    const prisma = getPrisma();
    const rec = await prisma.user.findUnique({ where: { id } });
    if (!rec) return { ok: false, code: "NOT_FOUND" };
    if (archived && rec.role === "ADMIN" && (await activeAdminsExcept(id)) === 0) return { ok: false, code: "LAST_ADMIN" };
    await prisma.user.update({ where: { id }, data: { deletedAt: archived ? new Date() : null, tokenVersion: { increment: 1 } } });
    return { ok: true, data: undefined };
  },

  async updateProfile(userId, input) {
    const r = await getPrisma().user.updateMany({ where: { id: userId, deletedAt: null }, data: { name: input.name.trim(), locale: input.locale } });
    return r.count ? { ok: true, data: undefined } : { ok: false, code: "NOT_FOUND" };
  },

  async updateLocale(userId, locale) {
    await getPrisma().user.updateMany({ where: { id: userId }, data: { locale } });
  },
};
