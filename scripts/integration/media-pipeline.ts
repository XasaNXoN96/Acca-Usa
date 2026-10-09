/**
 * Media pipeline with REAL ffmpeg / ffprobe (nothing mocked): generates files in many containers/codecs, runs them
 * through processFile() on the demo storage provider and checks the resulting status, probe data and renditions.
 *   npm run test:media-pipeline
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processFile, processPending, requeue } from "../../src/services/media/process";
import { planMedia } from "../../src/services/media/plan";
import { mediaToolsAvailable } from "../../src/services/media/tools";
import { getStorage } from "../../src/services/storage";
import { validateUpload } from "../../src/services/storage/validation";

const dir = mkdtempSync(join(tmpdir(), "mp-test-"));
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe" });
const video = ["-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3"];
const audio = ["-f", "lavfi", "-i", "sine=frequency=440:duration=3"];
let passed = 0;
const results: boolean[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(true); passed++; console.log("  ok  ", name); } catch (e) { results.push(false); console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 4).join("\n      ")); }
}
const probe = (path: string) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]).toString()) as { streams: { codec_name: string; codec_type: string }[]; format: { format_name: string } };

async function store(path: string, name: string, mime: string, status: "UPLOADED" | "READY" = "UPLOADED") {
  const bytes = readFileSync(path);
  return getStorage().put({ ownerId: "tester", file: new File([bytes], name), mime, status });
}
const make = (name: string, args: string[]) => { const p = join(dir, name); ff(...args, p); return p; };

async function main() {
  assert.ok(await mediaToolsAvailable(), "ffmpeg + ffprobe must be installed for this test");

  const cases: { name: string; args: string[]; mime: string; expectTranscoded: boolean; kind: "video" | "audio" }[] = [
    { name: "h264.mp4", args: [...video, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"], mime: "video/mp4", expectTranscoded: false, kind: "video" },
    { name: "vp9.webm", args: [...video, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "200k", "-c:a", "libopus"], mime: "video/webm", expectTranscoded: false, kind: "video" },
    { name: "lecture.mkv", args: [...video, "-c:v", "libx264", "-c:a", "aac"], mime: "video/x-matroska", expectTranscoded: true, kind: "video" },
    { name: "phone.mov", args: [...video, "-c:v", "libx264", "-c:a", "aac"], mime: "video/quicktime", expectTranscoded: true, kind: "video" },
    { name: "old.avi", args: [...video, "-c:v", "mpeg4", "-c:a", "mp3"], mime: "video/x-msvideo", expectTranscoded: true, kind: "video" },
    { name: "yuv444.mp4", args: [...video, "-c:v", "libx264", "-profile:v", "high444", "-pix_fmt", "yuv444p", "-c:a", "aac"], mime: "video/mp4", expectTranscoded: true, kind: "video" },
    { name: "voice.mp3", args: [...audio, "-c:a", "libmp3lame"], mime: "audio/mpeg", expectTranscoded: false, kind: "audio" },
    { name: "voice.m4a", args: [...audio, "-c:a", "aac"], mime: "audio/mp4", expectTranscoded: false, kind: "audio" },
    { name: "voice.wav", args: [...audio, "-c:a", "pcm_s16le"], mime: "audio/wav", expectTranscoded: false, kind: "audio" },
    { name: "voice.flac", args: [...audio, "-c:a", "flac"], mime: "audio/flac", expectTranscoded: false, kind: "audio" },
    { name: "voice.ogg", args: [...audio, "-c:a", "libvorbis"], mime: "audio/ogg", expectTranscoded: false, kind: "audio" },
    { name: "voice.aac", args: [...audio, "-c:a", "aac", "-f", "adts"], mime: "audio/aac", expectTranscoded: true, kind: "audio" },
  ];
  // yuv444.mp4: valid .mp4 + H.264, yet not widely decodable → must be converted (extension/container alone is not compatibility).
  for (const c of cases) {
    await step(`${c.name}: validate → upload → probe → ${c.expectTranscoded ? "TRANSCODE to browser format" : "play as is"} → READY`, async () => {
      const p = make(c.name, c.args);
      const bytes = readFileSync(p);
      const ok = await validateUpload(c.kind, new File([bytes], c.name));
      assert.ok(ok.ok, `validateUpload rejected ${c.name}: ${JSON.stringify(ok)}`);
      const meta = await store(p, c.name, c.mime);
      assert.equal(meta.status, "UPLOADED");
      const r = await processFile(meta.id);
      const after = await getStorage().stat(meta.id);
      assert.equal(r.status, "READY", `status ${r.status} ${r.code}`);
      assert.equal(after?.status, "READY");
      assert.ok(after?.durationSeconds && after.durationSeconds >= 2 && after.durationSeconds <= 4, `duration ${after?.durationSeconds}`);
      assert.ok(after?.container, "container recorded");
      if (c.kind === "video") assert.ok(after?.videoCodec && after.width && after.height, "video stream info recorded");
      if (c.expectTranscoded) {
        assert.ok(after?.playbackFileId, "rendition id recorded");
        const out = await getStorage().stat(after!.playbackFileId!);
        assert.equal(out?.status, "READY");
        assert.equal(out?.mime, c.kind === "video" ? "video/mp4" : "audio/mp4");
        const opened = await getStorage().open(out!.id);
        const tmp = join(dir, `rendition-${c.name}.${c.kind === "video" ? "mp4" : "m4a"}`);
        const chunks: Buffer[] = []; for await (const ch of opened!.stream as unknown as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(ch));
        writeFileSync(tmp, Buffer.concat(chunks));
        const pr = probe(tmp);
        assert.ok(pr.format.format_name.includes("mp4"), `rendition container ${pr.format.format_name}`);
        assert.ok(pr.streams.some((s) => s.codec_name === "aac"), "rendition has AAC");
        if (c.kind === "video") assert.ok(pr.streams.some((s) => s.codec_name === "h264"), "rendition has H.264");
      } else assert.equal(after?.playbackFileId, undefined, "no rendition for an already-compatible file");
      if (c.kind === "video") {
        assert.ok(after?.thumbnailFileId, "poster frame recorded");
        const th = await getStorage().stat(after!.thumbnailFileId!);
        assert.equal(th?.mime, "image/jpeg");
      }
    });
  }

  await step("corrupt media (valid-looking header, garbage body) → REJECTED / PROBE_FAILED, never served", async () => {
    const p = join(dir, "bad.mp4");
    writeFileSync(p, Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(16), Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 37) % 251))]));
    const check = await validateUpload("video", new File([readFileSync(p)], "bad.mp4"));
    assert.ok(check.ok, "header-level validation passes (that is why the pipeline exists)");
    const meta = await store(p, "bad.mp4", "video/mp4");
    const r = await processFile(meta.id);
    assert.equal(r.status, "REJECTED"); assert.equal(r.code, "PROBE_FAILED");
    assert.equal((await getStorage().stat(meta.id))?.status, "REJECTED");
    assert.equal(await requeue(meta.id), null, "REJECTED content is not retryable");
  });

  await step("audio-only file uploaded as video → REJECTED / NO_VIDEO_STREAM", async () => {
    const p = make("audioonly.mp4", [...audio, "-c:a", "aac"]);
    const meta = await store(p, "audioonly.mp4", "video/mp4");
    const r = await processFile(meta.id);
    assert.deepEqual([r.status, r.code], ["REJECTED", "NO_VIDEO_STREAM"]);
  });

  await step("spoofed upload (executable renamed .mp4) → SIGNATURE; unknown extension → TYPE; empty → EMPTY", async () => {
    const exe = new File([Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00" + "\x00".repeat(60))], "movie.mp4");
    assert.deepEqual(await validateUpload("video", exe), { ok: false, code: "SIGNATURE" });
    assert.deepEqual(await validateUpload("video", new File([Buffer.from("x")], "run.exe")), { ok: false, code: "TYPE" });
    assert.deepEqual(await validateUpload("video", new File([], "a.mp4")), { ok: false, code: "EMPTY" });
    assert.deepEqual(await validateUpload("video", new File([Buffer.from("....ftyp" + "0".repeat(60))], "../../etc/passwd.mp4")).then((r) => r.ok), true);
    const named = await validateUpload("video", new File([Buffer.from("....ftyp" + "0".repeat(60))], "../../etc/passwd.mp4"));
    assert.ok(named.ok && !named.safeName.includes("/") && !named.safeName.includes(".."), `path traversal name ${named.ok && named.safeName}`);
  });

  await step("FFmpeg missing → FAILED / FFMPEG_NOT_AVAILABLE (no fake success); retry after installing works", async () => {
    const p = make("late.mkv", [...video, "-c:v", "libx264", "-c:a", "aac"]);
    const meta = await store(p, "late.mkv", "video/x-matroska");
    const saved = { f: process.env.FFMPEG_PATH, p: process.env.FFPROBE_PATH };
    process.env.FFMPEG_PATH = "/nonexistent/ffmpeg"; process.env.FFPROBE_PATH = "/nonexistent/ffprobe";
    const r = await processFile(meta.id);
    assert.deepEqual([r.status, r.code], ["FAILED", "FFMPEG_NOT_AVAILABLE"]);
    assert.equal((await getStorage().stat(meta.id))?.playbackFileId, undefined);
    assert.equal(await mediaToolsAvailable(), false);
    process.env.FFMPEG_PATH = saved.f; process.env.FFPROBE_PATH = saved.p;
    if (saved.f === undefined) delete process.env.FFMPEG_PATH;
    if (saved.p === undefined) delete process.env.FFPROBE_PATH;
    assert.ok(await requeue(meta.id), "FAILED file can be requeued");
    const again = await processPending();
    assert.ok((again.results.READY ?? 0) >= 1, JSON.stringify(again));
    assert.equal((await getStorage().stat(meta.id))?.status, "READY");
  });

  await step("a file that is not UPLOADED is never re-processed (idempotent) and READY files are skipped", async () => {
    const p = make("once.mp4", [...video, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac"]);
    const meta = await store(p, "once.mp4", "video/mp4");
    assert.equal((await processFile(meta.id)).status, "READY");
    assert.equal((await processFile(meta.id)).status, "SKIPPED");
  });

  await step("planMedia: pure decisions (codec/container beat extension)", async () => {
    const base = { durationSeconds: 10 };
    assert.deepEqual(planMedia("video", "mp4", { ...base, container: "mov,mp4,m4a,3gp,3g2,mj2", video: { codec: "hevc", width: 1280, height: 720 }, audio: { codec: "aac" } }), { action: "transcode", target: "mp4" });
    assert.deepEqual(planMedia("video", "mp4", { ...base, container: "mov,mp4,m4a,3gp,3g2,mj2", video: { codec: "h264", width: 1280, height: 720 }, audio: { codec: "aac" } }), { action: "passthrough" });
    assert.deepEqual(planMedia("video", "mov", { ...base, container: "mov,mp4,m4a,3gp,3g2,mj2", video: { codec: "h264", width: 1280, height: 720 }, audio: { codec: "aac" } }), { action: "transcode", target: "mp4" });
    assert.equal(planMedia("video", "mp4", { ...base, container: "x", audio: { codec: "aac" } }).action, "reject");
    assert.equal(planMedia("video", "mp4", { durationSeconds: 7 * 3600, container: "mov,mp4", video: { codec: "h264", width: 1, height: 1 } }).action, "reject");
    assert.equal(planMedia("video", "mp4", { ...base, container: "mov,mp4", video: { codec: "h264", width: 7680, height: 4320 } }).action, "reject");
    assert.equal(planMedia("audio", "m4a", { ...base, container: "mov,mp4,m4a", audio: { codec: "alac" } }).action, "transcode");
  });
}

main().then(() => {
  rmSync(dir, { recursive: true, force: true });
  const failed = results.filter((x) => !x).length;
  console.log(`\n${passed}/${results.length} media-pipeline checks passed`);
  process.exit(failed ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
