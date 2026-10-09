import "server-only";
import type { MfaService } from "../contracts";
import { decryptSecret, encryptSecret, hashRecoveryCode, looksLikeRecoveryCode, newRecoveryCodes } from "@/lib/auth/mfa-crypto";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { getPrisma } from "@/lib/prisma";

export const mfaService: MfaService = {
  async status(userId) {
    const prisma = getPrisma();
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabledAt: true, mfaSecretEnc: true } });
    const left = await prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
    return { enabled: !!u?.mfaEnabledAt && !!u.mfaSecretEnc, recoveryCodesLeft: left };
  },

  async beginEnrollment(userId) {
    const prisma = getPrisma();
    const u = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!u) return { ok: false, code: "NOT_FOUND" };
    if (u.mfaEnabledAt) return { ok: false, code: "ALREADY_ENABLED" };
    const existing = u.mfaSecretEnc ? decryptSecret(u.mfaSecretEnc) : null;
    if (existing) return { ok: true, data: { secret: existing } };
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: encryptSecret(secret) } });
    return { ok: true, data: { secret } };
  },

  async confirmEnrollment(userId, code) {
    const prisma = getPrisma();
    const u = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!u || !u.mfaSecretEnc) return { ok: false, code: "NOT_FOUND" };
    if (u.mfaEnabledAt) return { ok: false, code: "ALREADY_ENABLED" };
    const secret = decryptSecret(u.mfaSecretEnc);
    const step = secret ? verifyTotp(secret, code, Date.now()) : null;
    if (step === null) return { ok: false, code: "INVALID_CODE", field: "code" };
    const codes = newRecoveryCodes();
    const done = await prisma.$transaction(async (tx) => {
      // conditional: only one concurrent confirmation can switch MFA on
      const claimed = await tx.user.updateMany({ where: { id: userId, mfaEnabledAt: null }, data: { mfaEnabledAt: new Date(), mfaLastStep: step, tokenVersion: { increment: 1 } } });
      if (claimed.count !== 1) return false;
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) });
      return true;
    });
    if (!done) return { ok: false, code: "ALREADY_ENABLED" };
    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } });
    return { ok: true, data: { recoveryCodes: codes, tokenVersion: fresh?.tokenVersion ?? 0 } };
  },

  async verifyLogin(userId, code) {
    const prisma = getPrisma();
    const u = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, status: "active" } });
    if (!u?.mfaEnabledAt || !u.mfaSecretEnc) return { ok: false };
    if (looksLikeRecoveryCode(code)) {
      // single use even under concurrent attempts: exactly one conditional update can win
      const used = await prisma.mfaRecoveryCode.updateMany({ where: { userId, codeHash: hashRecoveryCode(code), usedAt: null }, data: { usedAt: new Date() } });
      return used.count === 1 ? { ok: true, method: "recovery" } : { ok: false };
    }
    const secret = decryptSecret(u.mfaSecretEnc);
    const step = secret ? verifyTotp(secret, code, Date.now(), u.mfaLastStep ?? -1) : null;
    if (step === null) return { ok: false };
    // replay protection that survives concurrent requests: the step may only move forward
    const advanced = await prisma.user.updateMany({ where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] }, data: { mfaLastStep: step } });
    return advanced.count === 1 ? { ok: true, method: "totp" } : { ok: false };
  },

  async reset(userId) {
    const prisma = getPrisma();
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) return { ok: false, code: "NOT_FOUND" };
    await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastStep: null, tokenVersion: { increment: 1 } } }),
    ]);
    return { ok: true, data: undefined };
  },
};
