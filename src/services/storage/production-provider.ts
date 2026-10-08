import "server-only";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StoredFile as DbStoredFile } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { serverEnv } from "@/lib/env";
import type { OpenedFile, StorageProvider, StoredFileMeta } from "./contracts";
import { sanitizeFileName } from "./validation";

/**
 * Production storage: a PRIVATE S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, …) for the bytes and the
 * `StoredFile` table in PostgreSQL for the metadata.
 *  • object keys are server-generated (`files/<uuid>`), never derived from user input → no path tricks
 *  • the bucket must have public access blocked; browsers only ever receive bytes through /api/files/[id]
 *    (after the session / enrolment check) or a short-lived signed URL issued after that same check
 *  • uploads are streamed (multipart) — a 150 MB video is never buffered in memory
 * Callers must run validateUpload() BEFORE put(); the declared MIME type passed in is the one derived from the extension.
 */
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const DEFAULT_TTL = 120;
const MAX_TTL = 900;

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const toMeta = (r: DbStoredFile): StoredFileMeta => ({
  id: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.createdAt.toISOString(), ownerId: r.ownerId, attached: r.attached,
  storageKey: r.storageKey, durationSeconds: r.durationSeconds ?? undefined, thumbnailKey: r.thumbnailKey ?? undefined,
});

export class ProductionStorageProvider implements StorageProvider {
  readonly name = "production" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config = serverEnv.s3(), client?: S3Client) {
    this.bucket = config.bucket;
    this.client = client ?? new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put({ ownerId, file, mime, durationSeconds }: { ownerId: string; file: File; mime: string; durationSeconds?: number }): Promise<StoredFileMeta> {
    const id = randomUUID();
    const storageKey = `files/${id}`;
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket, Key: storageKey, Body: Readable.fromWeb(file.stream() as never), ContentType: mime,
        ContentLength: file.size, ServerSideEncryption: undefined,
      },
    }).done();
    try {
      const row = await getPrisma().storedFile.create({ data: { id, storageKey, name: sanitizeFileName(file.name), mime, size: file.size, ownerId, durationSeconds } });
      return toMeta(row);
    } catch (e) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey })).catch(() => undefined); // no orphan bytes
      throw e;
    }
  }

  async stat(id: string): Promise<StoredFileMeta | null> {
    if (!ID_RE.test(id)) return null;
    const row = await getPrisma().storedFile.findUnique({ where: { id } });
    return row ? toMeta(row) : null;
  }

  async exists(id: string): Promise<boolean> {
    const meta = await this.stat(id);
    if (!meta?.storageKey) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: meta.storageKey }));
      return true;
    } catch {
      return false;
    }
  }

  async open(id: string, range?: { start: number; end?: number }): Promise<OpenedFile | null> {
    const meta = await this.stat(id);
    if (!meta?.storageKey) return null;
    const size = meta.size;
    const start = Math.min(Math.max(range?.start ?? 0, 0), Math.max(size - 1, 0));
    const end = Math.min(range?.end ?? size - 1, size - 1);
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: meta.storageKey, Range: `bytes=${start}-${end}` }));
      if (!out.Body) return null;
      return { file: meta, stream: out.Body.transformToWebStream() as ReadableStream<Uint8Array>, start, end };
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const meta = await this.stat(id);
    if (!meta?.storageKey) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: meta.storageKey }));
    if (meta.thumbnailKey) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: meta.thumbnailKey })).catch(() => undefined);
    await getPrisma().storedFile.deleteMany({ where: { id } });
  }

  async replace(id: string, input: { ownerId: string; file: File; mime: string; durationSeconds?: number }): Promise<StoredFileMeta> {
    const next = await this.put(input);
    await this.delete(id);
    return next;
  }

  async markAttached(id: string, attached: boolean): Promise<void> {
    await getPrisma().storedFile.updateMany({ where: { id }, data: { attached } });
  }

  async signedUrl(id: string, options: { ttlSeconds?: number; download?: boolean } = {}): Promise<string | null> {
    const meta = await this.stat(id);
    if (!meta?.storageKey) return null;
    const ttl = Math.min(Math.max(options.ttlSeconds ?? DEFAULT_TTL, 10), MAX_TTL);
    const disposition = `${options.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: meta.storageKey, ResponseContentType: meta.mime, ResponseContentDisposition: disposition }),
      { expiresIn: ttl },
    );
  }

  /** Unattached uploads older than `olderThanMs` (abandoned forms). Called by a scheduled job; returns how many were removed. */
  async collectGarbage(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
    const stale = await getPrisma().storedFile.findMany({ where: { attached: false, createdAt: { lt: new Date(Date.now() - olderThanMs) } }, take: 200 });
    for (const f of stale) await this.delete(f.id);
    return stale.length;
  }
}
