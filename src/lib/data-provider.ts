/**
 * Which data provider backs `services.*`.
 *  - `memory`  in-memory demo database (default in demo mode; resets on restart)
 *  - `prisma`  PostgreSQL through Prisma (required in production mode)
 * Server-side only (not NEXT_PUBLIC): the browser never needs to know.
 */
export type DataProvider = "memory" | "prisma";

export const DATA_PROVIDER: DataProvider = process.env.DATA_PROVIDER === "prisma" ? "prisma" : "memory";
