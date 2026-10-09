import "server-only";
import { spawn } from "node:child_process";

/**
 * Runs an external media tool (ffmpeg / ffprobe). Arguments are passed as an array (no shell → no injection), output is
 * capped, and a hard timeout kills runaway jobs. Paths come from the server (temp dir), never from user input.
 */
export interface ToolResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; missing: boolean }

const CAP = 2 * 1024 * 1024;
const bin = (name: "ffmpeg" | "ffprobe") => (name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH) || name;

export function runTool(name: "ffmpeg" | "ffprobe", args: string[], timeoutMs: number): Promise<ToolResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let missing = false;
    const child = spawn(bin(name), args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => { if (stdout.length < CAP) stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString("utf8")).slice(-8192); });
    child.on("error", (e: NodeJS.ErrnoException) => { missing = e.code === "ENOENT"; clearTimeout(timer); resolve({ code: null, stdout, stderr: String(e.message), timedOut, missing }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut, missing }); });
  });
}

/** True when both binaries run. Reported honestly by the admin UI / docs — nothing is simulated when they are missing. */
export async function mediaToolsAvailable(): Promise<boolean> {
  const [a, b] = await Promise.all([runTool("ffmpeg", ["-version"], 10_000), runTool("ffprobe", ["-version"], 10_000)]);
  return a.code === 0 && b.code === 0;
}
