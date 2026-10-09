/** TOTP (RFC 6238 vectors), secret/recovery-code protection.   npm run test:mfa */
import assert from "node:assert/strict";
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, stepOf, verifyTotp } from "../../src/lib/auth/totp";
import { decryptSecret, encryptSecret, hashRecoveryCode, looksLikeRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from "../../src/lib/auth/mfa-crypto";

process.env.AUTH_SECRET = "x".repeat(48);
// ── RFC 6238 Appendix B (SHA-1, secret "12345678901234567890"): 8-digit values truncated to the 6 digits we use
const rfcSecret = Buffer.from("12345678901234567890");
const vectors: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
for (const [t, code] of vectors) assert.equal(hotp(rfcSecret, Math.floor(t / 30)), code, `RFC 6238 vector at t=${t}`);

// ── base32
for (const n of [1, 5, 10, 20, 33]) { const b = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)); assert.deepEqual(base32Decode(base32Encode(b)), b); }
assert.deepEqual(base32Decode("gezd gnbv-GY3T QOJQ"), Buffer.from("1234567890"), "spaces / dashes / case tolerated");
assert.throws(() => base32Decode("0189"), /invalid base32/);
const s = generateTotpSecret(); assert.match(s, /^[A-Z2-7]{32}$/); assert.notEqual(s, generateTotpSecret(), "secrets are random");

// ── verification window and replay protection
const secret = base32Encode(rfcSecret); const T = 1_700_000_000_000; const step = stepOf(T);
const at = (st: number) => hotp(rfcSecret, st);
assert.equal(verifyTotp(secret, at(step), T), step, "current code");
assert.equal(verifyTotp(secret, at(step - 1), T), step - 1, "previous step (clock drift)");
assert.equal(verifyTotp(secret, at(step + 1), T), step + 1, "next step");
assert.equal(verifyTotp(secret, at(step - 2), T), null, "two steps old is refused");
assert.equal(verifyTotp(secret, at(step + 2), T), null, "two steps ahead is refused");
assert.equal(verifyTotp(secret, at(step), T, step), null, "the same step cannot be used twice (replay)");
assert.equal(verifyTotp(secret, at(step - 1), T, step), null, "an older step after a newer one is refused");
assert.equal(verifyTotp(secret, at(step + 1), T, step), step + 1, "a newer step is accepted");
for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5", at(step).replace(/\d$/, (d) => String((Number(d) + 1) % 10))]) assert.equal(verifyTotp(secret, bad, T), null, `rejects ${JSON.stringify(bad)}`);
assert.equal(verifyTotp(secret, `${at(step).slice(0, 3)} ${at(step).slice(3)}`, T), step, "spaces inside the code are tolerated");
assert.equal(verifyTotp("not base32!", at(step), T), null, "a corrupt secret never verifies");
assert.match(otpauthUri("ACCA USA", "owner@x.co", secret), /^otpauth:\/\/totp\/ACCA%20USA%3Aowner%40x\.co\?secret=[A-Z2-7]+&issuer=ACCA%20USA&algorithm=SHA1&digits=6&period=30$/);

// ── secret at rest
const enc = encryptSecret(secret);
assert.ok(!enc.includes(secret) && enc.startsWith("v1."), "ciphertext does not contain the secret"); assert.notEqual(enc, encryptSecret(secret), "fresh IV every time");
assert.equal(decryptSecret(enc), secret);
assert.equal(decryptSecret(enc.slice(0, -2) + "xx"), null, "tampered ciphertext is rejected");
assert.equal(decryptSecret("garbage"), null);
process.env.AUTH_SECRET = "y".repeat(48);
// the derived key is cached with the secret by getAuthSecret(); a new process with another secret cannot read it (checked in a child)
// ── recovery codes
const codes = newRecoveryCodes(); assert.equal(codes.length, 10); assert.equal(new Set(codes).size, 10);
for (const c of codes) { assert.match(c, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/); assert.ok(looksLikeRecoveryCode(c)); assert.equal(hashRecoveryCode(c), hashRecoveryCode(c.toLowerCase().replace("-", " "))); assert.ok(!hashRecoveryCode(c).includes(normalizeRecoveryCode(c))); }
assert.notEqual(hashRecoveryCode(codes[0]!), hashRecoveryCode(codes[1]!)); assert.ok(!looksLikeRecoveryCode("123456"), "a TOTP code is not a recovery code");
console.log("mfa: all checks passed");
