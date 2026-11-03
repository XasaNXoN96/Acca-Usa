import { createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "./secret";

/**
 * Telegram second factor: secrets and codes. Only a keyed hash (HMAC-SHA-256, key derived from AUTH_SECRET) is stored; the code itself
 * exists in the Telegram message and in the administrator's head. A code is 6 digits, valid 5 minutes, usable once, 5 wrong tries.
 */
export const LOGIN_CODE_TTL_MS = 5 * 60_000;
export const LINK_TOKEN_TTL_MS = 15 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

const key = () => Buffer.from(hkdfSync("sha256", getAuthSecret(), Buffer.alloc(0), "acca-usa:telegram-secret:v1", 32));

/** purpose + user are part of the hash: a code of one user / flow can never match another's. */
export const hashTelegramSecret = (purpose: "link" | "login", userId: string, secret: string): string =>
  createHmac("sha256", key()).update(`${purpose}:${userId}:${secret}`).digest("hex");

export const newLoginCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
/** 24 random bytes → 32 URL-safe characters (Telegram accepts up to 64 in a /start parameter). */
export const newLinkToken = (): string => randomBytes(24).toString("base64url");

export const sameHash = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const looksLikeLoginCode = (v: string): boolean => /^\d{6}$/.test(v.trim());
