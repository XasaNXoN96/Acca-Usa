import "server-only";
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __accaPrisma?: PrismaClient };

/** One PrismaClient per server process (hot reload safe). Only `services/prisma/*` may import this. */
export function getPrisma(): PrismaClient {
  return (g.__accaPrisma ??= new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] }));
}
