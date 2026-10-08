import "server-only";
import { APP_MODE } from "@/lib/app-mode";
import type { StorageProvider } from "./contracts";
import { DemoStorageProvider } from "./demo-provider";
import { ProductionStorageProvider } from "./production-provider";

const g = globalThis as unknown as { __accaStorage?: StorageProvider };

/** Composition root for storage — the only place that knows which provider is active. */
export function getStorage(): StorageProvider {
  return (g.__accaStorage ??= APP_MODE === "demo" ? new DemoStorageProvider() : new ProductionStorageProvider());
}

export type { StorageProvider, StoredFileMeta } from "./contracts";
