import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

/** scrypt hash, format: s1$<salt>$<hash>. Plaintext passwords are never stored or logged. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `s1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  // Always do the work, even for unknown users, to keep timing uniform.
  const [v, saltB64, hashB64] = (stored ?? "s1$AAAAAAAAAAAAAAAAAAAAAA$AAAA").split("$");
  if (v !== "s1" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length || KEYLEN);
  return !!stored && expected.length === actual.length && timingSafeEqual(expected, actual);
}
