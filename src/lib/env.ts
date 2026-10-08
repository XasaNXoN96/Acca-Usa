import "server-only";
import { z } from "zod";

/**
 * Server-only environment. Validated once; importing this from a Client Component fails the build
 * (server-only), so secrets can never reach the browser bundle. Never use NEXT_PUBLIC_ for secrets.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(), // required from the backend block on
  AUTH_SECRET: z.string().min(32).optional(), // required from the backend block on
  AUTH_URL: z.string().url().optional(),
});

export const env = schema.parse(process.env);
