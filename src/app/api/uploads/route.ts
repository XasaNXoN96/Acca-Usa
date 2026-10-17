import busboy from "busboy";
import { PassThrough, Readable } from "node:stream";
import { after } from "next/server";
import { json, sameOrigin } from "@/lib/api-guards";
import { sessionOrNull, STAFF_ROLES } from "@/lib/auth/guards";
import { logEvent } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { processFile } from "@/services/media/process";
import { getStorage } from "@/services/storage";
import { UploadSizeError, countingStream } from "@/services/storage/stream-util";
import { checkUploadHead, uploadKinds, uploadRules, type UploadKind } from "@/services/storage/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard ceiling for one request body (largest per-kind cap + multipart overhead). Nginx must allow at least this (docs/VPS_DEPLOYMENT.md). */
const MAX_BODY = 160 * 1024 * 1024;
const HEAD_BYTES = 4096;

type Reply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
const reject = (kind: UploadKind, code: string): Reply => reply(code === "SIZE" ? 413 : 422, { ok: false, code, max: uploadRules[kind].maxBytes, types: uploadRules[kind].exts });

/**
 * POST /api/uploads  (multipart: `kind` first, then `file`)
 * Staff only. The body is STREAMED: the first bytes are checked (extension allow-list + magic bytes), the rest flows to storage
 * through a byte counter that enforces the per-kind size cap, so memory stays flat whatever the file size.
 * The declared MIME type and Content-Length are never trusted.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, code: "FORBIDDEN" }, 403);
  const session = await sessionOrNull(STAFF_ROLES);
  if (!session) return json({ ok: false, code: "FORBIDDEN" }, 403);

  const rl = await rateLimit(`upload:${session.user.id}`, 60, 60 * 60_000);
  if (!rl.ok) return json({ ok: false, code: "RATE_LIMITED" }, 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return json({ ok: false, code: "SIZE" }, 413);
  const contentType = req.headers.get("content-type") ?? "";
  if (!req.body || !/^multipart\/form-data;/i.test(contentType)) return json({ ok: false, code: "BAD_REQUEST" }, 400);

  const outcome = await receive(req, contentType, session.user.id);
  return json(outcome.body, outcome.status);
}

function receive(req: Request, contentType: string, ownerId: string): Promise<Reply> {
  return new Promise<Reply>((resolve) => {
    let kind: UploadKind | null = null;
    let work: Promise<Reply> | null = null;
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: { "content-type": contentType }, limits: { files: 1, fields: 4, parts: 6, fieldSize: 64, fileSize: MAX_BODY } });
    } catch {
      return resolve(reply(400, { ok: false, code: "BAD_REQUEST" }));
    }
    const input = Readable.fromWeb(req.body as never);
    const done = (r: Reply) => { resolve(r); };

    parser.on("field", (name, value) => {
      if (name === "kind" && (uploadKinds as readonly string[]).includes(value)) kind = value as UploadKind;
    });
    parser.on("file", (name, file, info) => {
      // `kind` must arrive before the file (the client sends it first) — the rules depend on it.
      if (name !== "file" || !kind || work) { file.resume(); if (!work) work = Promise.resolve(reply(400, { ok: false, code: "BAD_REQUEST" })); return; }
      work = handleFile(kind, file, info.filename ?? "", ownerId);
    });
    parser.on("error", () => { if (!work) work = Promise.resolve(reply(400, { ok: false, code: "BAD_REQUEST" })); });
    // `close` fires once the whole request body has been consumed (also for rejected files, which are drained and discarded).
    parser.on("close", () => { (work ?? Promise.resolve(reply(400, { ok: false, code: "BAD_REQUEST" }))).then(done, () => done(reply(500, { ok: false, code: "FAILED" }))); });
    input.on("error", () => { if (!work) work = Promise.resolve(reply(400, { ok: false, code: "BAD_REQUEST" })); parser.destroy(); resolve(reply(400, { ok: false, code: "BAD_REQUEST" })); });
    input.pipe(parser);
  });
}

async function handleFile(kind: UploadKind, file: NodeJS.ReadableStream & { truncated?: boolean }, filename: string, ownerId: string): Promise<Reply> {
  const rule = uploadRules[kind];
  // 1) read the first bytes (never the whole body)
  const chunks: Buffer[] = [];
  let have = 0;
  const iterator = (file as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  let ended = false;
  while (have < HEAD_BYTES) {
    const n = await iterator.next();
    if (n.done) { ended = true; break; }
    chunks.push(n.value); have += n.value.length;
  }
  const head = Buffer.concat(chunks);
  const check = checkUploadHead(kind, filename, head);
  const drain = async () => { if (!ended) for await (const _ of { [Symbol.asyncIterator]: () => iterator }) void _; };
  if (!check.ok) { await drain(); return reject(kind, check.code); }

  // 2) stream head + remainder to storage through the size cap
  const counter = countingStream(rule.maxBytes);
  const body = new PassThrough();
  body.pipe(counter);
  const pump = (async () => {
    try {
      body.write(head);
      if (!ended) for await (const c of { [Symbol.asyncIterator]: () => iterator }) { if (body.destroyed) continue; /* keep consuming so the request body is fully read */ if (!body.write(c)) await new Promise<void>((r) => { body.once("drain", r); body.once("close", r); }); }
      body.end();
    } catch (e) { body.destroy(e as Error); }
  })();
  const needsProcessing = kind === "video" || kind === "audio";
  try {
    // Video / audio are not served until the media pipeline (ffprobe + FFmpeg) has validated them: UPLOADED → … → READY.
    const stored = await getStorage().putStream({ ownerId, name: check.safeName, mime: check.mime, body: counter, status: needsProcessing ? "UPLOADED" : "READY" });
    await pump;
    if (needsProcessing && process.env.MEDIA_INLINE_PROCESSING !== "0") after(() => processFile(stored.id).catch(() => undefined)); // with a dedicated worker set MEDIA_INLINE_PROCESSING=0
    return reply(200, { ok: true, file: { id: stored.id, name: stored.name, mime: stored.mime, size: stored.size, durationSeconds: stored.durationSeconds, status: stored.status ?? "READY" } });
  } catch (e) {
    body.destroy(); // the counter / storage gave up: stop feeding it, then discard the rest of the request body
    await pump.catch(() => undefined);
    await drain().catch(() => undefined);
    if (e instanceof UploadSizeError || (file as { truncated?: boolean }).truncated) return reject(kind, "SIZE");
    logEvent("error", "upload.failed", { kind, error: e instanceof Error ? e.name : "unknown" });
    return reply(500, { ok: false, code: "FAILED" });
  }
}
