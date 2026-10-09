/**
 * Subtitle / transcript parsing and the speech-to-text adapter.
 *   npm run test:media-text
 * The STT adapter is exercised against a LOCAL fake HTTP endpoint: this proves request shape, parsing and error
 * handling only — it does NOT prove that any real speech-to-text vendor works (that stays NOT VERIFIED).
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cuesToVtt, parseSubtitles, parseTimestamp, parseTranscriptText, transcriptToText } from "../../src/services/media/subtitles";
import { OpenAiCompatibleStt } from "../../src/services/speech/openai-compatible";
import { getSpeechProvider } from "../../src/services/speech";

const results: boolean[] = [];
async function step(name: string, fn: () => Promise<void> | void) {
  try { await fn(); results.push(true); console.log("  ok  ", name); } catch (e) { results.push(false); console.log("  FAIL", name, "\n      ", String((e as Error).message).split("\n").slice(0, 3).join("\n      ")); }
}

async function main() {
  await step("timestamps: MM:SS, HH:MM:SS, comma/dot millis; invalid rejected", () => {
    assert.equal(parseTimestamp("01:05"), 65); assert.equal(parseTimestamp("1:02:03,500"), 3723.5); assert.equal(parseTimestamp("00:00:07.25"), 7.25);
    assert.equal(parseTimestamp("01:75"), null); assert.equal(parseTimestamp("abc"), null);
  });
  await step("SRT → clean WebVTT (BOM, CRLF, cue numbers, tags and `-->` in text removed)", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <b>world</b><script>alert(1)</script>\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nПривет, мир --> x\r\n";
    const r = parseSubtitles(srt); assert.ok(r.ok);
    assert.equal(r.cues.length, 2); assert.equal(r.cues[0]!.text, "Hello worldalert(1)");
    const vtt = cuesToVtt(r.cues); assert.ok(vtt.startsWith("WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nHello"), vtt); assert.ok(!vtt.includes("<")); assert.equal((vtt.match(/-->/g) ?? []).length, 2);
    assert.ok(parseSubtitles(vtt).ok, "round trip");
  });
  await step("bad inputs: empty, not subtitles, end before start", () => {
    assert.deepEqual(parseSubtitles("  \n "), { ok: false, code: "EMPTY" });
    assert.deepEqual(parseSubtitles("just some text"), { ok: false, code: "NOT_SUBTITLES" });
    assert.deepEqual(parseSubtitles("WEBVTT\n\n00:05.000 --> 00:02.000\nx"), { ok: false, code: "BAD_TIMES" });
  });
  await step("transcript text: parse → segments with end times → text round trip; bad line reported", () => {
    const p = parseTranscriptText("00:00 Welcome\n00:12 Second phrase\n[01:00] Third", 90); assert.ok(p.ok);
    assert.deepEqual(p.segments.map((s) => [s.start, s.end]), [[0, 12], [12, 60], [60, 70]]);
    assert.equal(transcriptToText(p.segments).split("\n")[1], "00:00:12 Second phrase".slice(0, 0) + "00:00:12 Second phrase");
    assert.deepEqual(parseTranscriptText("00:00 ok\nnot a line"), { ok: false, line: 2 });
  });

  const dir = mkdtempSync(join(tmpdir(), "stt-test-"));
  const audio = join(dir, "a.mp3"); writeFileSync(audio, Buffer.from("ID3fake"));
  let seen: { auth?: string; model?: string; lang?: string; fmt?: string; hasFile?: boolean } = {};
  let mode: "ok" | "500" | "empty" | "slow" = "ok";
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
      const body = Buffer.concat(chunks).toString("latin1");
      seen = { auth: req.headers.authorization, model: /name="model"\r\n\r\n([^\r]+)/.exec(body)?.[1], lang: /name="language"\r\n\r\n([^\r]+)/.exec(body)?.[1], fmt: /name="response_format"\r\n\r\n([^\r]+)/.exec(body)?.[1], hasFile: body.includes('name="file"') };
      if (req.url !== "/v1/audio/transcriptions" || req.method !== "POST") { res.statusCode = 404; return res.end(); }
      if (mode === "500") { res.statusCode = 500; return res.end("boom"); }
      if (mode === "slow") return; // never answers
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(mode === "empty" ? { text: "", segments: [] } : { segments: [{ start: 0, end: 2.5, text: " Hello " }, { start: 2.5, end: 5, text: "world" }, { start: 5, end: 6, text: "  " }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;

  await step("adapter: sends bearer key, model, language, verbose_json + file; parses segments (blank ones dropped)", async () => {
    const segs = await new OpenAiCompatibleStt({ baseUrl: base, apiKey: "k-test", model: "m1" }).transcribe({ audioPath: audio, language: "ru" });
    assert.deepEqual(segs, [{ start: 0, end: 2.5, text: "Hello" }, { start: 2.5, end: 5, text: "world" }]);
    assert.deepEqual(seen, { auth: "Bearer k-test", model: "m1", lang: "ru", fmt: "verbose_json", hasFile: true });
  });
  await step("adapter: HTTP 500 → STT_REQUEST_FAILED; empty result → STT_BAD_RESPONSE; no answer → STT_TIMEOUT (no invented text)", async () => {
    const stt = new OpenAiCompatibleStt({ baseUrl: base, apiKey: "k", model: "m", timeoutMs: 400 });
    mode = "500"; await assert.rejects(stt.transcribe({ audioPath: audio, language: "en" }), { code: "STT_REQUEST_FAILED" });
    mode = "empty"; await assert.rejects(stt.transcribe({ audioPath: audio, language: "en" }), { code: "STT_BAD_RESPONSE" });
    mode = "slow"; await assert.rejects(stt.transcribe({ audioPath: audio, language: "en" }), { code: "STT_TIMEOUT" });
  });
  await step("provider selection: NOT CONNECTED unless STT_PROVIDER + STT_API_KEY are set", () => {
    const keep = { p: process.env.STT_PROVIDER, k: process.env.STT_API_KEY };
    delete process.env.STT_PROVIDER; delete process.env.STT_API_KEY; assert.equal(getSpeechProvider(), null);
    process.env.STT_PROVIDER = "openai-compatible"; assert.equal(getSpeechProvider(), null, "key missing");
    process.env.STT_API_KEY = "x"; assert.equal(getSpeechProvider()?.name, "openai-compatible");
    process.env.STT_PROVIDER = "demo"; assert.equal(getSpeechProvider(), null, "no demo provider exists");
    if (keep.p === undefined) delete process.env.STT_PROVIDER; else process.env.STT_PROVIDER = keep.p;
    if (keep.k === undefined) delete process.env.STT_API_KEY; else process.env.STT_API_KEY = keep.k;
  });
  await step("end-to-end with a configured (fake) provider: request → QUEUED → PROCESSING → COMPLETED / FAILED; never COMPLETED without text", async () => {
    const { services } = await import("../../src/services");
    const { requestTranscript, runTranscription } = await import("../../src/services/speech/run");
    const id = "bt-business-organisations-and-their-stakeholders-video";
    delete process.env.STT_PROVIDER;
    assert.deepEqual(await requestTranscript(id, "en"), { ok: false, code: "STT_NOT_CONNECTED" });
    assert.equal(await services.mediaText.getTranscript(id), null, "nothing queued when NOT CONNECTED");
    process.env.STT_PROVIDER = "openai-compatible"; process.env.STT_API_KEY = "k"; process.env.STT_API_URL = base; process.env.STT_MODEL = "m";
    assert.deepEqual(await requestTranscript("nope", "en"), { ok: false, code: "NOT_FOUND" });
    assert.deepEqual(await requestTranscript("bt-business-organisations-and-their-stakeholders-notes", "en"), { ok: false, code: "NOT_MEDIA" });
    mode = "ok";
    assert.deepEqual(await requestTranscript(id, "en"), { ok: true });
    assert.equal((await services.mediaText.getTranscript(id))?.status, "QUEUED");
    assert.deepEqual(await requestTranscript(id, "en"), { ok: false, code: "ALREADY_RUNNING" });
    await runTranscription(id);
    const done = await services.mediaText.getTranscript(id);
    assert.equal(done?.status, "COMPLETED"); assert.equal(done?.provider, "openai-compatible"); assert.equal(done?.segments.length, 2); assert.ok(seen.hasFile && seen.lang === "en");
    mode = "500";
    await services.mediaText.saveTranscript({ materialId: id, language: "en", status: "QUEUED", provider: "openai-compatible", segments: [] });
    await runTranscription(id);
    const failed = await services.mediaText.getTranscript(id);
    assert.equal(failed?.status, "FAILED"); assert.equal(failed?.errorCode, "STT_REQUEST_FAILED"); assert.equal(failed?.segments.length, 0);
    delete process.env.STT_PROVIDER; delete process.env.STT_API_KEY; delete process.env.STT_API_URL; delete process.env.STT_MODEL;
  });
  server.closeAllConnections(); server.close(); rmSync(dir, { recursive: true, force: true });
}

main().then(() => { const bad = results.filter((x) => !x).length; console.log(`\n${results.length - bad}/${results.length} media-text checks passed`); process.exit(bad ? 1 : 0); }).catch((e) => { console.error(e); process.exit(1); });
