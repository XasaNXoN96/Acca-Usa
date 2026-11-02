import "server-only";

/**
 * Process-wide snapshot of the (user-independent) catalogue, shared by every request for CATALOG_CACHE_SECONDS (default 5; 0 = off).
 * Kept in its own tiny module so admin actions can invalidate it without importing the database client (demo mode has none).
 */
export const CATALOG_TTL_MS = Math.max(0, Number(process.env.CATALOG_CACHE_SECONDS ?? 5)) * 1000;

type Entry = { at: number; value: Promise<unknown> };
let entry: Entry | null = null;

export function invalidateCatalog(): void { entry = null; }

export function cachedCatalog<T>(load: () => Promise<T>): Promise<T> {
  if (CATALOG_TTL_MS === 0) return load();
  const now = Date.now();
  if (!entry || now - entry.at > CATALOG_TTL_MS) {
    const value = load();
    const mine: Entry = { at: now, value };
    entry = mine;
    value.catch(() => { if (entry === mine) entry = null; });
  }
  return entry.value as Promise<T>;
}
