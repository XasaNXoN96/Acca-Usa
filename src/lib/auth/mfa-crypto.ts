import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { getAuthSecret } from "./secret";

/**
 * Protection of MFA material at rest.
 *  • the TOTP secret is stored ENCRYPTED (AES-256-GCM, key derived from AUTH_SECRET with HKDF) — a database dump alone cannot
 *    produce second-factor codes. Rotating AUTH_SECRET makes stored secrets unreadable → use `npm run admin:mfa-reset`.
 *  • recovery codes are stored only as HMAC-SHA-256 (keyed by a derived key), never in clear.
 */
const key = (label: string) => Buffer.from(hkdfSync("sha256", getAuthSecret(), Buffer.alloc(0), `acca-usa:${label}:v1`, 32));

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("mfa-secret"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string | null {
  try {
    const [v, iv, tag, ct] = stored.split(".");
    if (v !== "v1" || !iv || !tag || !ct) return null;
    const d = createDecipheriv("aes-256-gcm", key("mfa-secret"), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null; // tampered, truncated, or encrypted under another AUTH_SECRET
  }
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const b = randomBytes(10);
    const raw = Array.from(b, (x) => RECOVERY_ALPHABET[x % RECOVERY_ALPHABET.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const normalizeRecoveryCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const looksLikeRecoveryCode = (s: string) => normalizeRecoveryCode(s).length === 10;
export const hashRecoveryCode = (code: string) => createHmac("sha256", key("mfa-recovery")).update(normalizeRecoveryCode(code)).digest("hex");
