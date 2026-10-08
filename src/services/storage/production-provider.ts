import "server-only";
import type { OpenedFile, StorageProvider, StoredFileMeta } from "./contracts";

/**
 * PLACEHOLDER for the backend block: S3-compatible object storage (private bucket),
 * uploads via presigned PUT, downloads via short-lived signed GET URLs, virus scan hook,
 * per-object ownership/ACL stored in PostgreSQL. Not implemented on purpose.
 */
export class ProductionStorageProvider implements StorageProvider {
  readonly name = "production" as const;
  private fail(): never {
    throw new Error("ProductionStorageProvider is not implemented yet. Run in demo mode (NEXT_PUBLIC_APP_MODE=demo).");
  }
  put(_input: { ownerId: string; file: File; mime: string }): Promise<StoredFileMeta> { return this.fail(); }
  stat(_id: string): Promise<StoredFileMeta | null> { return this.fail(); }
  open(_id: string): Promise<OpenedFile | null> { return this.fail(); }
  delete(_id: string): Promise<void> { return this.fail(); }
  replace(_id: string, _input: { ownerId: string; file: File; mime: string }): Promise<StoredFileMeta> { return this.fail(); }
  markAttached(_id: string, _attached: boolean): Promise<void> { return this.fail(); }
}
