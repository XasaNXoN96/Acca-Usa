import "server-only";
import type { TelegramAuthService } from "../contracts";
import { LINK_TOKEN_TTL_MS, LOGIN_CODE_TTL_MS, MAX_CODE_ATTEMPTS, hashTelegramSecret, newLinkToken, newLoginCode, sameHash } from "@/lib/auth/telegram-codes";
import { getPrisma } from "@/lib/prisma";

const isUnique = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export const telegramAuthService: TelegramAuthService = {
  async status(userId) {
    const l = await getPrisma().telegramLink.findUnique({ where: { userId } });
    return l ? { linked: true, username: l.username ?? undefined } : { linked: false };
  },

  async beginLink(userId) {
    const prisma = getPrisma();
    const u = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: "active", role: "ADMIN" } });
    if (!u) return { ok: false, code: "NOT_FOUND" };
    const token = newLinkToken();
    await prisma.$transaction([
      prisma.telegramToken.deleteMany({ where: { userId, purpose: "link" } }), // only the newest link works
      prisma.telegramToken.create({ data: { userId, purpose: "link", secretHash: hashTelegramSecret("link", userId, token), expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS) } }),
    ]);
    return { ok: true, data: { token } };
  },

  async completeLink(token, chat) {
    const prisma = getPrisma();
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false };
    // The token carries no user id: find the candidates (unexpired, unused link tokens) and match by keyed hash.
    const candidates = await prisma.telegramToken.findMany({ where: { purpose: "link", usedAt: null, expiresAt: { gt: new Date() } }, take: 50, orderBy: { createdAt: "desc" } });
    const hit = candidates.find((c) => sameHash(c.secretHash, hashTelegramSecret("link", c.userId, token)));
    if (!hit) return { ok: false };
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.telegramToken.updateMany({ where: { id: hit.id, usedAt: null }, data: { usedAt: new Date() } }); // single use, even when raced
      if (claimed.count !== 1) return { ok: false as const };
      const user = await tx.user.findFirst({ where: { id: hit.userId, deletedAt: null, status: "active", role: "ADMIN" } });
      if (!user) return { ok: false as const };
      try {
        await tx.telegramLink.upsert({ where: { userId: user.id }, create: { userId: user.id, chatId: chat.id, username: chat.username ?? null }, update: { chatId: chat.id, username: chat.username ?? null, linkedAt: new Date() } });
      } catch (e) {
        if (isUnique(e)) return { ok: false as const }; // this Telegram account is already linked to another administrator
        throw e;
      }
      return { ok: true as const, userId: user.id, userName: user.name };
    });
  },

  async unlink(userId) {
    const r = await getPrisma().telegramLink.deleteMany({ where: { userId } });
    await getPrisma().telegramToken.deleteMany({ where: { userId } });
    return r.count ? { ok: true, data: undefined } : { ok: false, code: "NOT_FOUND" };
  },

  async chatOf(userId) {
    return (await getPrisma().telegramLink.findUnique({ where: { userId } }))?.chatId ?? null;
  },

  async issueLoginCode(userId) {
    const prisma = getPrisma();
    const link = await prisma.telegramLink.findUnique({ where: { userId } });
    if (!link) return { ok: false, code: "NOT_LINKED" };
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newLoginCode();
      try {
        await prisma.$transaction([
          prisma.telegramToken.deleteMany({ where: { userId, purpose: "login" } }), // the previous code stops working
          prisma.telegramToken.create({ data: { userId, purpose: "login", secretHash: hashTelegramSecret("login", userId, code), expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) } }),
        ]);
        return { ok: true, chatId: link.chatId, code };
      } catch (e) { if (!isUnique(e)) throw e; }
    }
    return { ok: false, code: "NOT_LINKED" };
  },
};

/** Used by mfaService.verifyLogin: true when `code` is the live, unused code of this user's pending sign-in (consumes it). */
export async function consumeTelegramLoginCode(userId: string, code: string): Promise<boolean> {
  const prisma = getPrisma();
  const t = await prisma.telegramToken.findFirst({ where: { userId, purpose: "login", usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!t || t.attempts >= MAX_CODE_ATTEMPTS) return false;
  // count the try BEFORE comparing: a guesser cannot get more than MAX_CODE_ATTEMPTS looks at one code, however fast
  const counted = await prisma.telegramToken.updateMany({ where: { id: t.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
  if (counted.count !== 1) return false;
  if (!sameHash(t.secretHash, hashTelegramSecret("login", userId, code.trim()))) return false;
  const used = await prisma.telegramToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1;
}
