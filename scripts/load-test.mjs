#!/usr/bin/env node
/**
 * Load test for a STAGING / local server (never run it against production with real students).
 *   BASE=https://staging.example.com STUDENT_COOKIE=<session cookie value of a test student> \
 *   VIDEO_FILE_ID=<id of a READY video the student may open> VIEWERS=50 SECONDS=60 BITRATE_MBPS=2.5 \
 *   node scripts/load-test.mjs
 * Simulates VIEWERS people watching video at BITRATE_MBPS (range requests of CHUNK_MB, default 1, paced like a player buffering ahead) and reports,
 * per range request, latency percentiles and "stalls" (a chunk that took longer than the time it covers, i.e. the player would
 * run dry). Run it FROM ANOTHER MACHINE or its own CPU cores: the load generator must not compete with the server.
 * Optional: PAGES="/dashboard,/courses" PAGE_USERS=30 adds students loading pages while the videos play.
 */
const BASE = (process.env.BASE ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const COOKIE = process.env.STUDENT_COOKIE ?? "";
const FILE = process.env.VIDEO_FILE_ID ?? "";
const VIEWERS = Number(process.env.VIEWERS ?? 20);
const SECONDS = Number(process.env.SECONDS ?? 30);
const MBPS = Number(process.env.BITRATE_MBPS ?? 2.5);
const PAGES = (process.env.PAGES ?? "").split(",").filter(Boolean);
const PAGE_USERS = Number(process.env.PAGE_USERS ?? 0);
if (!COOKIE) { console.error("STUDENT_COOKIE is required (the value of the acca_session cookie of a TEST student)."); process.exit(2); }
const headers = { cookie: `acca_session=${COOKIE}` };
const CHUNK = Math.round(Number(process.env.CHUNK_MB ?? 1) * 1024 * 1024); // browsers ask for much larger ranges than 1 MB; CHUNK_MB=1 is the harsh case
const chunkSeconds = (CHUNK * 8) / (MBPS * 1_000_000); // playback time covered by one 1 MB chunk
const end = Date.now() + SECONDS * 1000;
const lat = [], pageLat = [];
let stalls = 0, errors = 0, bytes = 0, pageErrors = 0;

let size = 0;
if (FILE) {
  const r = await fetch(`${BASE}/api/files/${FILE}`, { headers: { ...headers, range: "bytes=0-0" } });
  size = Number((r.headers.get("content-range") ?? "").split("/")[1] ?? 0);
  await r.arrayBuffer();
  if (!size) { console.error(`cannot read the video (status ${r.status})`); process.exit(2); }
}

async function viewer() {
  let pos = Math.floor(Math.random() * Math.max(1, size - CHUNK * 20));
  let buffered = 0; // seconds of video the player holds
  while (Date.now() < end) {
    const t0 = performance.now();
    try {
      const r = await fetch(`${BASE}/api/files/${FILE}`, { headers: { ...headers, range: `bytes=${pos}-${pos + CHUNK - 1}` } });
      const buf = await r.arrayBuffer();
      if (r.status !== 206 && r.status !== 200) throw new Error(String(r.status));
      bytes += buf.byteLength;
    } catch { errors++; await new Promise((r) => setTimeout(r, 500)); continue; }
    const ms = performance.now() - t0; lat.push(ms);
    pos += CHUNK; if (pos > size - CHUNK) pos = 0;
    buffered += chunkSeconds - ms / 1000;                // playing consumes time, the download adds a chunk
    if (buffered < -0.001) { stalls++; buffered = 0; }   // ran dry: the viewer would see buffering
    buffered = Math.min(buffered, 30);
    if (buffered > 20) await new Promise((r) => setTimeout(r, (buffered - 10) * 1000)); // player stops fetching when its buffer is full
  }
}
async function pageUser() {
  while (Date.now() < end) {
    for (const p of PAGES) {
      const t0 = performance.now();
      try { const r = await fetch(BASE + p, { headers, redirect: "manual" }); await r.arrayBuffer(); if (r.status >= 500) pageErrors++; } catch { pageErrors++; }
      pageLat.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 4000));
    }
  }
}
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))].toFixed(0) : "-");

console.log(`${VIEWERS} viewers @ ${MBPS} Mbit/s, ${PAGE_USERS} page users, ${SECONDS}s against ${BASE}`);
await Promise.all([...(FILE ? Array.from({ length: VIEWERS }, viewer) : []), ...Array.from({ length: PAGE_USERS }, pageUser)]);
console.log(`video: ${lat.length} chunks, ${(bytes / 1e6).toFixed(0)} MB, ${(bytes * 8 / 1e6 / SECONDS).toFixed(0)} Mbit/s total | chunk latency ms p50 ${pct(lat, 50)} p95 ${pct(lat, 95)} p99 ${pct(lat, 99)} | stalls ${stalls} | errors ${errors}`);
if (PAGES.length) console.log(`pages: ${pageLat.length} loads | latency ms p50 ${pct(pageLat, 50)} p95 ${pct(pageLat, 95)} p99 ${pct(pageLat, 99)} | errors ${pageErrors}`);
process.exit(errors || pageErrors ? 1 : 0);
