import "server-only";
import net from "node:net";
import type { Readable } from "node:stream";

/**
 * Antivirus scanning through a ClamAV daemon (clamd) using its INSTREAM protocol — the file is streamed to the daemon,
 * never buffered in memory and never written to an extra temp file. No scanner is simulated: with ANTIVIRUS_PROVIDER=none
 * nothing is scanned (an explicit, documented choice); with `clamav` a file is served only after clamd said OK.
 *
 *   ANTIVIRUS_PROVIDER = none | clamav
 *   CLAMAV_HOST (127.0.0.1) + CLAMAV_PORT (3310)   or   CLAMAV_SOCKET (/run/clamav/clamd.ctl)
 *   CLAMAV_TIMEOUT_MS  idle timeout of one scan (default 120000)
 */
export type ScanResult = { status: "clean" } | { status: "infected"; signature: string } | { status: "unavailable"; reason: string };

export const antivirusMode = (): "none" | "clamav" => (process.env.ANTIVIRUS_PROVIDER === "clamav" ? "clamav" : "none");

const CHUNK_LIMIT = 1 << 20;

export function scanStream(input: Readable): Promise<ScanResult> {
  return new Promise<ScanResult>((resolve) => {
    const timeoutMs = Math.max(5_000, Number(process.env.CLAMAV_TIMEOUT_MS) || 120_000);
    const socketPath = process.env.CLAMAV_SOCKET;
    const sock = socketPath ? net.createConnection({ path: socketPath }) : net.createConnection({ host: process.env.CLAMAV_HOST || "127.0.0.1", port: Number(process.env.CLAMAV_PORT) || 3310 });
    let reply = "";
    let settled = false;
    const done = (r: ScanResult) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      input.destroy();
      resolve(r);
    };
    sock.setTimeout(timeoutMs, () => done({ status: "unavailable", reason: "TIMEOUT" }));
    sock.on("error", (e: NodeJS.ErrnoException) => done({ status: "unavailable", reason: e.code ?? "SOCKET" }));
    sock.on("data", (d) => { reply += d.toString("utf8"); });
    sock.on("close", () => {
      const line = reply.replace(/\0/g, "").trim();
      if (/^stream: OK$/.test(line)) return done({ status: "clean" });
      const found = /^stream: (.+) FOUND$/.exec(line);
      if (found) return done({ status: "infected", signature: found[1]!.slice(0, 120) });
      done({ status: "unavailable", reason: line ? "SCANNER_ERROR" : "NO_ANSWER" });
    });
    sock.on("connect", () => {
      sock.write("zINSTREAM\0");
      input.on("data", (chunk: Buffer) => {
        for (let i = 0; i < chunk.length; i += CHUNK_LIMIT) {
          const part = chunk.subarray(i, i + CHUNK_LIMIT);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length);
          if (!sock.write(Buffer.concat([len, part]))) { input.pause(); sock.once("drain", () => input.resume()); }
        }
      });
      input.on("end", () => sock.write(Buffer.alloc(4))); // zero-length chunk = end of stream
      input.on("error", () => done({ status: "unavailable", reason: "SOURCE" }));
    });
  });
}
