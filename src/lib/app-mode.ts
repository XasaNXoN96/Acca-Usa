/**
 * Application mode. `NEXT_PUBLIC_APP_MODE=demo` (default) runs fully standalone on
 * demo data and the demo storage provider. `production` requires real providers
 * (database, storage, payments) that arrive in the backend block — it fails fast until then.
 * The value is not a secret (it is inlined into the client bundle on purpose).
 */
export type AppMode = "demo" | "production";

export const APP_MODE: AppMode = process.env.NEXT_PUBLIC_APP_MODE === "production" ? "production" : "demo";
export const isDemoMode = APP_MODE === "demo";
