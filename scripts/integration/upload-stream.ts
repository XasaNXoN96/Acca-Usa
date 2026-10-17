/**
 * Streaming upload + media worker reliability, with REAL ffmpeg and the demo storage provider (no network):
 *  - size cap enforced on the byte stream (a lying Content-Length changes nothing), no partial object left behind
 *  - a large body is streamed to storage without being held in memory
 *  - head checks: extension allow-list + magic bytes (renamed / spoofed files)
 *  - atomic claim: concurrent workers process a file exactly once; stale PROCESSING is recovered; fresh PROCESSING is not
 *  - low disk space → NO_DISK_SPACE (and the file can be retried), shutdown → SKIPPED / file back to UPLOADED
 *   npm run test:upload-stream
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { processFile, processPending, requestShutdown, requeue } from "../../src/services/media/process";
import { mediaToolsAvailable } from "../../src/services/media/tools";
import { getStorage } from "../../src/services/storage";
import { UploadSizeError, countingStream } from "../../src/services/storage/stream-util";
import { checkUploadHead } from "../../src/services/storage/validation";

const dir = mkdtempSync(join(tmpdir(), "us-test-"));
let failed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log("  ok  ", name); } catch (e) { failed++; console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 4).join("\n      ")); }
}
const chunks = function* (total: number, size = 1 << 20) { for (let n = 0; n < total; n += size) yield Buffer.alloc(Math.min(size, total - n), 7); };
const storage = () => getStorage();

async function video() {
  const p = join(dir, "v.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", p]);
  return storage().put({ ownerId: "t", file: new File([readFileSync(p)], "v.mp4"), mime: "video/mp4", status: "UPLOADED" });
}

async function main() {
  assert.ok(await mediaToolsAvailable(), "ffmpeg + ffprobe must be installed for this test");

  await step("size cap is enforced on the stream and nothing is stored", async () => {
    const before = (await storage().listByStatus(["UPLOADED"], 100)).length;
    const body = Readable.from(chunks(5 << 20)).pipe(countingStream(1 << 20));
    await assert.rejects(storage().putStream({ ownerId: "t", name: "big.mp4", mime: "video/mp4", body, status: "UPLOADED" }), (e: unknown) => e instanceof UploadSizeError || (e as Error).name === "UploadSizeError");
    assert.equal((await storage().listByStatus(["UPLOADED"], 100)).length, before);
  });

  await step("a 64 MB body streams to storage intact with flat memory", async () => {
    global.gc?.();
    const rss0 = process.memoryUsage().rss;
    const total = 64 << 20;
    const body = Readable.from(chunks(total)).pipe(countingStream(100 << 20));
    const meta = await storage().putStream({ ownerId: "t", name: "doc.pdf", mime: "application/pdf", body, status: "READY" });
    assert.equal(meta.size, total);
    assert.equal((await storage().stat(meta.id))?.size, total);
    const grew = (process.memoryUsage().rss - rss0) / (1 << 20);
    assert.ok(grew < 48, `RSS grew by ${grew.toFixed(0)} MB for a 64 MB upload`);
  });

  await step("an aborted body leaves no object behind", async () => {
    const before = (await storage().listByStatus(["UPLOADED"], 100)).length;
    const body = new Readable({ read() { this.push(Buffer.alloc(1024, 1)); setImmediate(() => this.destroy(new Error("client went away"))); } });
    await assert.rejects(storage().putStream({ ownerId: "t", name: "x.mp4", mime: "video/mp4", body, status: "UPLOADED" }));
    assert.equal((await storage().listByStatus(["UPLOADED"], 100)).length, before);
  });

  await step("renamed / spoofed files are rejected by name and magic bytes", async () => {
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(32)]);
    assert.deepEqual({ ok: false, code: "SIGNATURE" }, checkUploadHead("video", "lecture.mp4", png));
    assert.deepEqual({ ok: false, code: "TYPE" }, checkUploadHead("video", "run.exe", mp4));
    assert.deepEqual({ ok: false, code: "TYPE" }, checkUploadHead("video", "noext", mp4));
    assert.deepEqual({ ok: false, code: "EMPTY" }, checkUploadHead("video", "a.mp4", new Uint8Array()));
    const ok = checkUploadHead("video", "../../etc/passwd/lecture 1.mp4", mp4);
    assert.ok(ok.ok && !ok.safeName.includes("/") && ok.mime === "video/mp4");
  });

  await step("claim: 10 concurrent claims → exactly one winner", async () => {
    const f = await video();
    const won = (await Promise.all(Array.from({ length: 10 }, () => storage().claim(f.id, { maxAttempts: 3, staleBefore: new Date(Date.now() - 60_000) })))).filter(Boolean);
    assert.equal(won.length, 1);
    assert.equal((await storage().stat(f.id))?.status, "PROCESSING");
  });

  await step("a fresh PROCESSING file is not taken over; a stale one is recovered", async () => {
    const f = await video();
    await storage().claim(f.id, { maxAttempts: 3, staleBefore: new Date(0) });
    assert.equal((await processFile(f.id)).status, "SKIPPED"); // claimed a moment ago by "another worker"
    await storage().update(f.id, { processedAt: new Date(Date.now() - 6 * 3600_000).toISOString() }); // that worker died hours ago
    const r = await processPending(50);
    assert.ok((r.results.READY ?? 0) >= 1, JSON.stringify(r));
    assert.equal((await storage().stat(f.id))?.status, "READY");
  });

  await step("two workers racing for one file: processed exactly once", async () => {
    const f = await video();
    const r = await Promise.all([processFile(f.id), processFile(f.id)]);
    assert.deepEqual(r.map((x) => x.status).sort(), ["READY", "SKIPPED"]);
  });

  await step("low free disk space → FAILED NO_DISK_SPACE, retry works once space exists", async () => {
    const f = await video();
    process.env.MEDIA_MIN_FREE_MB = "999999999";
    const r = await processFile(f.id);
    delete process.env.MEDIA_MIN_FREE_MB;
    assert.deepEqual([r.status, r.code], ["FAILED", "NO_DISK_SPACE"]);
    assert.ok(await requeue(f.id));
    assert.equal((await processFile(f.id)).status, "READY");
  });

  await step("shutdown: no new file is started and the queue keeps the file", async () => {
    const f = await video();
    requestShutdown();
    assert.equal((await processFile(f.id)).status, "SKIPPED");
    assert.equal((await storage().stat(f.id))?.status, "UPLOADED");
  });

  console.log(failed ? `\n${failed} step(s) failed` : "\nall upload-stream checks passed");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
