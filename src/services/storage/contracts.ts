import type { StoredFile } from "@/types";

export interface StoredFileMeta extends StoredFile {
  ownerId: string;
  attached: boolean;
  /** Key of the object inside the bucket / folder (never shown to browsers). */
  storageKey?: string;
  /** Media metadata (video / audio) — see docs/MEDIA.md. Absent until known; never invented. */
  durationSeconds?: number;
  thumbnailKey?: string;
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
 *  - ProductionStorageProvider: private S3-compatible bucket + PostgreSQL metadata, optional short-lived signed URLs
 * Callers must validate files with validateUpload() BEFORE calling put().
 */
export interface StorageProvider {
  readonly name: "demo" | "production";
  put(input: { ownerId: string; file: File; mime: string; durationSeconds?: number }): Promise<StoredFileMeta>;
  stat(id: string): Promise<StoredFileMeta | null>;
  open(id: string, range?: { start: number; end?: number }): Promise<OpenedFile | null>;
  delete(id: string): Promise<void>;
  /** Stores the new file, then removes the old one. Returns the new object. */
  replace(id: string, input: { ownerId: string; file: File; mime: string; durationSeconds?: number }): Promise<StoredFileMeta>;
  /** Attached files are kept; unattached uploads are garbage-collected after a while. */
  markAttached(id: string, attached: boolean): Promise<void>;
  exists(id: string): Promise<boolean>;
  /**
   * Short-lived signed GET URL for the object, or null when the provider cannot sign (demo). Callers must have
   * authorised the user for this file FIRST — a signed URL is a capability, not an access check.
   */
  signedUrl(id: string, options?: { ttlSeconds?: number; download?: boolean }): Promise<string | null>;
}
