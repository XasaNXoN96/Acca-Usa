import type { StoredFile } from "@/types";

export interface StoredFileMeta extends StoredFile {
  ownerId: string;
  attached: boolean;
}

export interface OpenedFile {
  file: StoredFileMeta;
  stream: ReadableStream<Uint8Array>;
  /** inclusive byte range actually returned */
  start: number;
  end: number;
}

/**
 * Storage abstraction. Features/routes depend on this interface only.
 *  - DemoStorageProvider: local temp directory, no external services (demo mode)
 *  - ProductionStorageProvider: S3-compatible object storage + signed URLs (backend block)
 * Callers must validate files with validateUpload() BEFORE calling put().
 */
export interface StorageProvider {
  readonly name: "demo" | "production";
  put(input: { ownerId: string; file: File; mime: string }): Promise<StoredFileMeta>;
  stat(id: string): Promise<StoredFileMeta | null>;
  open(id: string, range?: { start: number; end?: number }): Promise<OpenedFile | null>;
  delete(id: string): Promise<void>;
  /** Stores the new file, then removes the old one. Returns the new object. */
  replace(id: string, input: { ownerId: string; file: File; mime: string }): Promise<StoredFileMeta>;
  /** Attached files are kept; unattached uploads are garbage-collected after a while. */
  markAttached(id: string, attached: boolean): Promise<void>;
}
