import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) with HMAC-SHA-1, 6 digits, 30 s steps — what Google Authenticator, Microsoft Authenticator, Authy, 1Password … expect.
 * Pure functions (no I/O). The caller owns replay protection through the `lastStep` it stored.
 */
export const STEP_SECONDS = 30;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("invalid base32");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 160-bit random shared secret, base32 (the form shown to the user). */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  const code = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS);

/**
 * Returns the matching time step, or null. Accepts the previous / current / next step (clock drift) and REJECTS any step that
 * is not newer than `lastStep` — a code that was already used (or an older one) can never be replayed.
 */
export function verifyTotp(secretBase32: string, input: string, nowMs: number, lastStep = -1, window = 1): number | null {
  const code = input.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  let secret: Buffer;
  try { secret = base32Decode(secretBase32); } catch { return null; }
  const now = stepOf(nowMs);
  let match: number | null = null;
  for (let s = now - window; s <= now + window; s++) {
    const expected = Buffer.from(hotp(secret, s));
    const given = Buffer.from(code);
    if (expected.length === given.length && timingSafeEqual(expected, given) && s > lastStep) match = s; // no early exit: constant work
  }
  return match;
}

export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
