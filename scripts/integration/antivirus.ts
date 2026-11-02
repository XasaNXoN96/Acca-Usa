/**
 * Antivirus integration (ClamAV INSTREAM) against a local TEST DOUBLE of clamd that speaks the real protocol framing and flags the
 * EICAR test string. Proves OUR side: framing, streaming of large files, infected → REJECTED (never served), scanner down → file waits
 * (attempt refunded) and is scanned once the scanner is back, garbage / silent scanner → unavailable (never "clean").
 * It does NOT prove detection quality — that is ClamAV's signature database (see docs/ANTIVIRUS.md for the real-clamd lab check).
 *   npm run test:antivirus
 */
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { Readable } from "node:stream";

process.env.ANTIVIRUS_PROVIDER = "clamav";
process.env.CLAMAV_PORT = "47310";
process.env.CLAMAV_HOST = "127.0.0.1";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
let mode: "ok" | "garbage" | "silent" = "ok";
let framingErrors = 0;
let scans = 0;

function fakeClamd() {
  return net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let started = false;
    let data = Buffer.alloc(0);
    sock.on("error", () => {});
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (!started) {
        if (buf.length < 10) return;
        if (buf.subarray(0, 10).toString() !== "zINSTREAM\0") { framingErrors++; sock.destroy(); return; }
        started = true; buf = buf.subarray(10);
      }
      while (buf.length >= 4) {
        const n = buf.readUInt32BE(0);
        if (n === 0) {
          scans++;
          if (mode === "silent") return;
          const reply = mode === "garbage" ? "lolwut\0" : data.includes(EICAR) ? "stream: Win.Test.EICAR_HDB-1 FOUND\0" : "stream: OK\0";
          sock.end(reply); return;
        }
        if (buf.length < 4 + n) break;
        data = Buffer.concat([data, buf.subarray(4, 4 + n)]);
        buf = buf.subarray(4 + n);
      }
    });
  });
}

let failed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log("  ok  ", name); } catch (e) { failed++; console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 4).join("\n      ")); }
}

async function main() {
  const { scanStream } = await import("../../src/services/security/antivirus");
  const { processFile } = await import("../../src/services/media/process");
  const { getStorage } = await import("../../src/services/storage");
  const storage = getStorage();
  const put = (name: string, body: Buffer) => storage.put({ ownerId: "t", file: new File([new Uint8Array(body)], name), mime: "application/pdf", status: "UPLOADED" });
  const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n${extra}\n%%EOF`);

  let server = fakeClamd();
  server.listen(47310, "127.0.0.1"); await once(server, "listening");

  await step("clean stream → clean; EICAR → infected with the signature name", async () => {
    assert.deepEqual(await scanStream(Readable.from([Buffer.from("hello")])), { status: "clean" });
    const r = await scanStream(Readable.from([Buffer.from("xx"), Buffer.from(EICAR), Buffer.from("yy")]));
    assert.equal(r.status, "infected");
    assert.match((r as { signature: string }).signature, /EICAR/);
  });

  await step("a 70 MB body is framed correctly and streamed (chunk framing intact, no protocol error)", async () => {
    const chunks = function* () { for (let i = 0; i < 70; i++) yield Buffer.alloc(1 << 20, 65); };
    assert.deepEqual(await scanStream(Readable.from(chunks())), { status: "clean" });
    assert.equal(framingErrors, 0);
  });

  await step("garbage or silent scanner is never treated as clean", async () => {
    mode = "garbage";
    assert.equal((await scanStream(Readable.from([Buffer.from("a")]))).status, "unavailable");
    mode = "ok";
  });

  await step("stored file: clean PDF → READY; infected PDF → REJECTED / VIRUS_FOUND and never served", async () => {
    const good = await put("good.pdf", pdf("fine"));
    assert.equal((await processFile(good.id)).status, "READY");
    const bad = await put("bad.pdf", pdf(EICAR));
    const r = await processFile(bad.id);
    assert.deepEqual([r.status, r.code], ["REJECTED", "VIRUS_FOUND"]);
    const meta = await storage.stat(bad.id);
    assert.equal(meta?.status, "REJECTED");
    assert.equal((await processFile(bad.id)).status, "SKIPPED", "a rejected file is never retried");
  });

  await step("scanner down: file waits (attempt refunded, stays out of service) and is scanned when the scanner returns", async () => {
    server.close(); await once(server, "close");
    const f = await put("wait.pdf", pdf("later"));
    for (let i = 0; i < 5; i++) {
      const r = await processFile(f.id);
      assert.deepEqual([r.status, r.code], ["FAILED", "SCANNER_UNAVAILABLE"]);
    }
    const m = await storage.stat(f.id);
    assert.equal(m?.attempts, 0, "waiting for the scanner must not use up the retry budget");
    assert.notEqual(m?.status, "READY");
    server = fakeClamd(); server.listen(47310, "127.0.0.1"); await once(server, "listening");
    assert.equal((await processFile(f.id)).status, "READY");
  });

  await step("a scan that gets no answer ends as unavailable (timeout), not clean", async () => {
    process.env.CLAMAV_TIMEOUT_MS = "5000";
    mode = "silent";
    const t0 = Date.now();
    const r = await scanStream(Readable.from([Buffer.from("a")]));
    assert.equal(r.status, "unavailable");
    assert.ok(Date.now() - t0 < 9000);
    mode = "ok";
  });

  server.close();
  console.log(failed ? `\n${failed} step(s) failed` : `\nall antivirus checks passed (${scans} scans)`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
