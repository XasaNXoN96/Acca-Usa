/**
 * Media worker: processes every uploaded video / audio file that is waiting — UPLOADED, FAILED with attempts left, and files
 * stuck in PROCESSING by a worker that died. Safe to run next to the web app and next to other workers: each file is claimed
 * atomically, so it is processed exactly once.
 *
 *   npm run media:worker                  one pass, then exit (cron)
 *   npm run media:worker -- --loop        keep polling (systemd service; see docs/VPS_DEPLOYMENT.md)
 *
 * Same environment as the web app (DATA_PROVIDER, DATABASE_URL, S3_*, NEXT_PUBLIC_APP_MODE) plus optional
 * MEDIA_POLL_SECONDS (15), MEDIA_CONCURRENCY (1), MEDIA_TMP_DIR, MEDIA_TRANSCODE_TIMEOUT_MS, MEDIA_STALE_MINUTES, MEDIA_MIN_FREE_MB.
 * Requires `ffmpeg` and `ffprobe` on PATH (or FFMPEG_PATH / FFPROBE_PATH).
 *
 * SIGTERM / SIGINT: stop taking new files, stop the running ffmpeg, put the file in flight back to UPLOADED, exit 0.
 * A second signal exits immediately. Logs are one JSON line per event on stdout / stderr (journald-friendly, no secrets).
 */
import { processPending, requestShutdown } from "../src/services/media/process";
import { mediaToolsAvailable } from "../src/services/media/tools";

const log = (level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) =>
  (level === "info" ? process.stdout : process.stderr).write(`${JSON.stringify({ t: new Date().toISOString(), level, event, ...fields })}\n`);

const loop = process.argv.includes("--loop");
const pollMs = Math.max(1, Number(process.env.MEDIA_POLL_SECONDS ?? 15)) * 1000;
let stopping = false;
let wake: (() => void) | null = null;

function stop(signal: string) {
  if (stopping) { log("warn", "media_worker.forced_exit", { signal }); process.exit(1); }
  stopping = true;
  log("info", "media_worker.stopping", { signal });
  requestShutdown();
  wake?.();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

async function pass() {
  const r = await processPending();
  log("info", "media_worker.pass", { processed: r.processed, results: r.results });
}

(async () => {
  if (!(await mediaToolsAvailable())) log("warn", "media_worker.ffmpeg_missing", { effect: "files will be marked FAILED (FFMPEG_NOT_AVAILABLE)" });
  log("info", "media_worker.started", { loop, pollSeconds: pollMs / 1000 });
  do {
    try { await pass(); } catch (e) { log("error", "media_worker.pass_failed", { error: e instanceof Error ? e.name : "unknown" }); }
    if (loop && !stopping) await new Promise<void>((r) => { wake = r; setTimeout(r, pollMs).unref(); });
  } while (loop && !stopping);
  log("info", "media_worker.stopped");
  process.exit(0);
})();
