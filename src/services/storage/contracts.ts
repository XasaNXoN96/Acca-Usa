import type { StoredFile } from "@/types";

/** UPLOADED → PROCESSING → READY | FAILED (retryable) | REJECTED (content failed validation; never served). */
export type FileStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "REJECTED";

export interface StoredFileMeta extends StoredFile {
  ownerId: string;
  attached: boolean;
  /** Key of the object inside the bucket / folder (never shown to browsers). */
  storageKey?: string;
  /** Media metadata (video / audio) — see docs/MEDIA.md. Absent until known; never invented. */
  durationSeconds?: number;
  thumbnailKey?: string;
  /** Absent on legacy sidecars = READY (they were validated at upload and are served). */
  status?: FileStatus;
  /** Machine code of the last failure / rejection (FFMPEG_NOT_AVAILABLE, PROBE_FAILED, …). */
  statusCode?: string;
  attempts?: number;
  processedAt?: string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  /** Id of the browser-playable rendition made by FFmpeg (null/absent = the file itself plays). */
  playbackFileId?: string;
  thumbnailFileId?: string;
}

export type FileMetaPatch = Partial<Pick<StoredFileMeta, "status" | "statusCode" | "attempts" | "processedAt" | "container" | "videoCodec" | "audioCodec" | "width" | "height" | "playbackFileId" | "thumbnailFileId" | "durationSeconds">>;

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
  put(input: { ownerId: string; file: File; mime: string; durationSeconds?: number; status?: FileStatus; attached?: boolean }): Promise<StoredFileMeta>;
  /** Updates processing metadata (status, codecs, rendition ids). `null` clears a field. */
  update(id: string, patch: { [K in keyof FileMetaPatch]?: FileMetaPatch[K] | null }): Promise<StoredFileMeta | null>;
  /** Files in the given states, oldest first — the processing queue is the StoredFile table / sidecar files themselves. */
  listByStatus(statuses: FileStatus[], limit?: number): Promise<StoredFileMeta[]>;
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
