/**
 * Media worker: processes every uploaded video / audio file that is waiting (UPLOADED, or FAILED with attempts left).
 * Run it from cron / a process manager next to the web app (same env: DATA_PROVIDER, DATABASE_URL, S3_*, APP mode):
 *   npm run media:worker            # one pass
 *   npm run media:worker -- --loop  # keep polling every 15 s
 * Requires `ffmpeg` and `ffprobe` on PATH (or FFMPEG_PATH / FFPROBE_PATH).
 */
import { processPending } from "../src/services/media/process";
import { mediaToolsAvailable } from "../src/services/media/tools";

async function pass() {
  if (!(await mediaToolsAvailable())) console.error("WARNING: ffmpeg / ffprobe not found — files will be marked FAILED (FFMPEG_NOT_AVAILABLE)");
  const r = await processPending();
  console.log(`[media-worker] processed ${r.processed}`, JSON.stringify(r.results));
}

const loop = process.argv.includes("--loop");
(async () => {
  do { await pass().catch((e) => console.error("[media-worker]", e)); if (loop) await new Promise((r) => setTimeout(r, 15_000)); } while (loop);
})();
