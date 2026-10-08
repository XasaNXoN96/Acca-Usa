/** Environment validation rules (pure).   npm run test:env */
import assert from "node:assert/strict";
import { assertEnv, validateEnv } from "../../src/lib/env-check";

const full = {
  NEXT_PUBLIC_APP_MODE: "production", DATA_PROVIDER: "prisma", DATABASE_URL: "postgresql://u:p@h:5432/d", AUTH_SECRET: "x".repeat(48), APP_URL: "https://acca.example",
  S3_BUCKET: "b", S3_REGION: "r", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", SMTP_HOST: "h", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASSWORD: "p", EMAIL_FROM: "a@b.co",
  PAYMENT_SECRET_KEY: "sk", PAYMENT_WEBHOOK_SECRET: "wh",
};
const names = (env: Record<string, string | undefined>) => validateEnv(env).issues.map((i) => i.name).sort();

assert.deepEqual(names({}), [], "demo needs nothing");
assert.deepEqual(names(full), [], "a complete production configuration is valid");
assert.deepEqual(names({ NEXT_PUBLIC_APP_MODE: "production" }).includes("AUTH_SECRET"), true);
for (const key of Object.keys(full).filter((k) => k !== "NEXT_PUBLIC_APP_MODE" && k !== "DATA_PROVIDER")) {
  const { [key]: _removed, ...rest } = full as Record<string, string>;
  assert.ok(names(rest).includes(key), `missing ${key} is reported`);
}
assert.ok(names({ ...full, DATA_PROVIDER: "memory" }).includes("DATA_PROVIDER"), "memory provider refused in production");
assert.ok(names({ ...full, AUTH_SECRET: "short" }).includes("AUTH_SECRET"), "short secret refused");
assert.ok(names({ ...full, APP_URL: "http://acca.example" }).includes("APP_URL"), "http APP_URL refused");
assert.ok(names({ ...full, DATABASE_URL: "mysql://x" }).includes("DATABASE_URL"), "non-postgres URL refused");
assert.ok(names({ ...full, SMTP_PORT: "abc" }).includes("SMTP_PORT"), "bad port refused");
assert.ok(names({ ...full, DEMO_LOGIN: "1" }).includes("DEMO_LOGIN"), "demo logins refused in production");
assert.ok(names({ AUTH_SECRET: "short" }).includes("AUTH_SECRET"), "even demo mode rejects a malformed secret");
try { assertEnv({ ...full, AUTH_SECRET: "super-secret-but-short" }); assert.fail("should throw"); } catch (e) {
  const msg = String((e as Error).message);
  assert.ok(msg.includes("AUTH_SECRET") && !msg.includes("super-secret-but-short"), "names are listed, values never");
}
console.log("env-check: all checks passed");
