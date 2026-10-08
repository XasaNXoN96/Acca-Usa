/**
 * Media metadata reader against REAL files produced by ffmpeg (3.0 s each). ffmpeg is a test-time tool only.
 *   npm run test:media
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { formatDuration, readMediaInfo } from "../../src/services/storage/media-info";

const dir = mkdtempSync(join(tmpdir(), "media-info-"));
const make = (name: string, args: string[]) => {
  const out = join(dir, name);
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args, out], { stdio: "inherit" });
  return new Blob([readFileSync(out)]);
};
const video = ["-f", "lavfi", "-i", "testsrc=duration=3:size=64x64:rate=10"];
const audio = ["-f", "lavfi", "-i", "sine=frequency=440:duration=3"];

async function main() {
const cases: [string, string, Blob][] = [
  ["mp4 (moov at end)", "mp4", make("a.mp4", [...video, "-pix_fmt", "yuv420p", "-c:v", "libx264"])],
  ["mp4 (faststart)", "mp4", make("b.mp4", [...video, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-movflags", "+faststart"])],
  ["m4a", "m4a", make("c.m4a", [...audio, "-c:a", "aac"])],
  ["webm", "webm", make("d.webm", [...video, "-c:v", "libvpx"])],
  ["wav", "wav", make("e.wav", audio)],
];
for (const [label, ext, blob] of cases) {
  const info = await readMediaInfo(blob, ext);
  assert.ok(info, `${label}: duration found`);
  assert.ok(Math.abs(info.durationSeconds - 3) <= 1, `${label}: expected ~3 s, got ${info.durationSeconds}`);
  console.log(`ok  ${label}: ${info.durationSeconds}s`);
}
assert.equal(await readMediaInfo(make("f.mp3", [...audio, "-c:a", "libmp3lame"]), "mp3"), null, "mp3 duration stays unknown (never guessed)");
assert.equal(await readMediaInfo(new Blob([new Uint8Array(100)]), "mp4"), null, "garbage → null, no throw");
assert.equal(await readMediaInfo(new Blob([]), "webm"), null, "empty → null");
assert.equal(formatDuration(65), "1:05");
assert.equal(formatDuration(3725), "1:02:05");
console.log("media-info: all checks passed");
}
main().catch((e) => { console.error(e); process.exit(1); });
