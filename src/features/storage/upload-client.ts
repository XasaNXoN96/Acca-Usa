import type { UploadKind } from "@/services/storage/validation";

export type FileState = "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "REJECTED";
export interface UploadedFile { id: string; name: string; mime: string; size: number; status?: FileState }
export interface MediaStatus { status: FileState; code: string | null; transcoded: boolean; container: string | null; videoCodec: string | null; audioCodec: string | null }

export async function fetchMediaStatus(id: string): Promise<MediaStatus | null> {
  try {
    const r = await fetch(`/api/media/${encodeURIComponent(id)}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as MediaStatus) : null;
  } catch { return null; }
}

export async function retryMedia(id: string): Promise<MediaStatus | null> {
  try {
    const r = await fetch(`/api/media/${encodeURIComponent(id)}`, { method: "POST" });
    return r.ok ? ((await r.json()) as MediaStatus) : null;
  } catch { return null; }
}
export type UploadOutcome =
  | { ok: true; file: UploadedFile }
  | { ok: false; code: "TYPE" | "SIZE" | "SIGNATURE" | "EMPTY" | "FORBIDDEN" | "NETWORK" | "ABORTED" | "FAILED"; max?: number; types?: string[] };

/** XHR (not fetch) because it reports upload progress. Server re-validates everything. */
export function uploadFile(kind: UploadKind, file: File, onProgress: (percent: number) => void): { promise: Promise<UploadOutcome>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadOutcome>((resolve) => {
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => resolve({ ok: false, code: "NETWORK" });
    xhr.onabort = () => resolve({ ok: false, code: "ABORTED" });
    xhr.onload = () => {
      const body = xhr.response as { ok?: boolean; file?: UploadedFile; code?: string; max?: number; types?: string[] } | null;
      if (body?.ok && body.file) return resolve({ ok: true, file: body.file });
      const code = body?.code;
      if (code === "TYPE" || code === "SIZE" || code === "SIGNATURE" || code === "EMPTY" || code === "FORBIDDEN") return resolve({ ok: false, code, max: body?.max, types: body?.types });
      resolve({ ok: false, code: xhr.status === 403 ? "FORBIDDEN" : "FAILED" });
    };
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export async function deleteUpload(id: string): Promise<void> {
  try {
    await fetch(`/api/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* orphaned uploads are garbage-collected by the storage provider */
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
