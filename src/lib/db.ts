import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton (prevents connection exhaustion during dev hot reload).
 * Only services/prisma/* may import this — never routes or components.
 * Not used yet: services/mock/* serve the UI until the backend block.
 */
const g = globalThis as unknown as { __prisma?: PrismaClient };

export const db = g.__prisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") g.__prisma = db;
