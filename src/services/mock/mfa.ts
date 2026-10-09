import "server-only";
import type { MfaService } from "../contracts";
import { decryptSecret, encryptSecret, hashRecoveryCode, looksLikeRecoveryCode, newRecoveryCodes } from "@/lib/auth/mfa-crypto";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { getDb, nowIso } from "./db";

export const mfaService: MfaService = {
  async status(userId) {
    const db = getDb();
    const u = db.users.find((x) => x.id === userId);
    return { enabled: !!u?.mfaEnabledAt && !!u.mfaSecretEnc, recoveryCodesLeft: db.mfaRecovery.filter((r) => r.userId === userId && !r.usedAt).length };
  },

  async beginEnrollment(userId) {
    const u = getDb().users.find((x) => x.id === userId && !x.deletedAt);
    if (!u) return { ok: false, code: "NOT_FOUND" };
    if (u.mfaEnabledAt) return { ok: false, code: "ALREADY_ENABLED" };
    const existing = u.mfaSecretEnc ? decryptSecret(u.mfaSecretEnc) : null;
    const secret = existing ?? generateTotpSecret();
    if (!existing) u.mfaSecretEnc = encryptSecret(secret);
    return { ok: true, data: { secret } };
  },

  async confirmEnrollment(userId, code) {
    const db = getDb();
    const u = db.users.find((x) => x.id === userId && !x.deletedAt);
    if (!u || !u.mfaSecretEnc) return { ok: false, code: "NOT_FOUND" };
    if (u.mfaEnabledAt) return { ok: false, code: "ALREADY_ENABLED" };
    const secret = decryptSecret(u.mfaSecretEnc);
    const step = secret ? verifyTotp(secret, code, Date.now()) : null;
    if (step === null) return { ok: false, code: "INVALID_CODE", field: "code" };
    const codes = newRecoveryCodes();
    db.mfaRecovery = db.mfaRecovery.filter((r) => r.userId !== userId);
    for (const c of codes) db.mfaRecovery.push({ userId, codeHash: hashRecoveryCode(c) });
    u.mfaEnabledAt = nowIso();
    u.mfaLastStep = step;
    u.tokenVersion += 1; // every session opened before the second factor existed is revoked
    return { ok: true, data: { recoveryCodes: codes, tokenVersion: u.tokenVersion } };
  },

  async verifyLogin(userId, code) {
    const db = getDb();
    const u = db.users.find((x) => x.id === userId && !x.deletedAt && x.status === "active");
    if (!u?.mfaEnabledAt || !u.mfaSecretEnc) return { ok: false };
    if (looksLikeRecoveryCode(code)) {
      const rec = db.mfaRecovery.find((r) => r.userId === userId && !r.usedAt && r.codeHash === hashRecoveryCode(code));
      if (!rec) return { ok: false };
      rec.usedAt = nowIso();
      return { ok: true, method: "recovery" };
    }
    const secret = decryptSecret(u.mfaSecretEnc);
    const step = secret ? verifyTotp(secret, code, Date.now(), u.mfaLastStep ?? -1) : null;
    if (step === null) return { ok: false };
    u.mfaLastStep = step;
    return { ok: true, method: "totp" };
  },

  async reset(userId) {
    const db = getDb();
    const u = db.users.find((x) => x.id === userId);
    if (!u) return { ok: false, code: "NOT_FOUND" };
    u.mfaSecretEnc = undefined;
    u.mfaEnabledAt = undefined;
    u.mfaLastStep = undefined;
    u.tokenVersion += 1;
    db.mfaRecovery = db.mfaRecovery.filter((r) => r.userId !== userId);
    return { ok: true, data: undefined };
  },
};
