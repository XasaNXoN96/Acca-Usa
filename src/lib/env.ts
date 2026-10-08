import "server-only";
import { assertEnv } from "./env-check";

/**
 * Server-only environment accessors. Importing this from a Client Component fails the build (server-only), so
 * secrets can never reach the browser bundle. Never use NEXT_PUBLIC_ for secrets. Validation lives in env-check.ts
 * and runs at startup (src/instrumentation.ts).
 */
export const serverEnv = {
  appUrl: () => process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000",
  s3: () => {
    assertEnv();
    return {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET ?? "",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    };
  },
  smtp: () => ({
    host: process.env.SMTP_HOST ?? "", port: Number(process.env.SMTP_PORT ?? 587), user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "", from: process.env.EMAIL_FROM ?? "", secure: process.env.SMTP_SECURE === "1",
  }),
  payment: () => ({ secretKey: process.env.PAYMENT_SECRET_KEY ?? "", webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "" }),
};
