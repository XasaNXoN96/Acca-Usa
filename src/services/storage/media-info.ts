/**
 * Container-level media metadata read from the uploaded bytes themselves (no ffmpeg, no external service).
 *  • mp4 / m4a   `moov > mvhd` (timescale + duration), found by walking the top-level boxes
 *  • webm        `Segment > Info > Duration` (EBML)
 *  • wav         fmt byte rate + data chunk size
 * Anything else (mp3, ogg, …) returns `null`: the duration is then UNKNOWN and is never guessed. This reads container
 * headers only — it does not decode streams and says nothing about codec compatibility (see docs/MEDIA.md).
 */
export interface MediaInfo { durationSeconds: number }

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
const read = async (file: Blob, start: number, length: number) => new Uint8Array(await file.slice(start, start + length).arrayBuffer());
const sane = (s: number) => (Number.isFinite(s) && s > 0 && s < 60 * 60 * 24 ? Math.round(s) : null);

async function mp4Duration(file: Blob): Promise<number | null> {
  let offset = 0;
  for (let i = 0; i < 64 && offset + 8 <= file.size; i++) {
    const head = await read(file, offset, 16);
    let size = u32(head, 0);
    const type = ascii(head, 4, 4);
    let header = 8;
    if (size === 1) { size = u64(head, 8); header = 16; } else if (size === 0) size = file.size - offset;
    if (size < header) return null;
    if (type === "moov") {
      if (size > 32 * 1024 * 1024) return null;
      const moov = await read(file, offset + header, size - header);
      // mvhd is the first child of moov in practice, but walk the children anyway.
      let p = 0;
      while (p + 8 <= moov.length) {
        const csize = u32(moov, p);
        if (csize < 8) return null;
        if (ascii(moov, p + 4, 4) === "mvhd") {
          const v = moov[p + 8];
          const base = p + 8 + 4; // after version + flags
          const timescale = v === 1 ? u32(moov, base + 16) : u32(moov, base + 8);
          const duration = v === 1 ? u64(moov, base + 20) : u32(moov, base + 12);
          return timescale ? sane(duration / timescale) : null;
        }
        p += csize;
      }
      return null;
    }
    offset += size;
  }
  return null;
}

/** EBML variable-length integer: returns [value, byteLength]; `raw` keeps the length marker (element IDs). */
function vint(b: Uint8Array, o: number, raw = false): [number, number] | null {
  const first = b[o];
  if (!first) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || o + len > b.length) return null;
  let v = raw ? first : first & (0xff >> len);
  for (let i = 1; i < len; i++) v = v * 256 + b[o + i]!;
  return [v, len];
}

async function webmDuration(file: Blob): Promise<number | null> {
  const b = await read(file, 0, 512 * 1024);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let scale = 1_000_000;
  let duration: number | null = null;
  const walk = (start: number, end: number) => {
    let o = start;
    while (o < end) {
      const id = vint(b, o, true);
      if (!id) return;
      const sz = vint(b, o + id[1]);
      if (!sz) return;
      const body = o + id[1] + sz[1];
      if (id[0] === 0x18538067 || id[0] === 0x1549a966) walk(body, Math.min(body + sz[0], end)); // Segment, Info
      else if (id[0] === 0x2ad7b1) { scale = 0; for (let i = 0; i < sz[0]; i++) scale = scale * 256 + b[body + i]!; }
      else if (id[0] === 0x4489) duration = sz[0] === 4 ? dv.getFloat32(body) : sz[0] === 8 ? dv.getFloat64(body) : null;
      if (duration !== null && scale) return;
      o = body + sz[0];
      if (id[0] === 0x1f43b675) return; // Cluster: Info always precedes it
    }
  };
  walk(0, b.length);
  return duration !== null && scale ? sane((duration * scale) / 1e9) : null;
}

async function wavDuration(file: Blob): Promise<number | null> {
  const b = await read(file, 0, 4096);
  if (ascii(b, 0, 4) !== "RIFF") return null;
  let byteRate = 0;
  let o = 12;
  while (o + 8 <= b.length) {
    const id = ascii(b, o, 4);
    const size = b[o + 4]! | (b[o + 5]! << 8) | (b[o + 6]! << 16) | (b[o + 7]! << 24);
    if (id === "fmt ") byteRate = (b[o + 16]! | (b[o + 17]! << 8) | (b[o + 18]! << 16) | (b[o + 19]! << 24)) >>> 0;
    if (id === "data") return byteRate ? sane((size >>> 0 ? Math.min(size >>> 0, file.size - o - 8) : 0) / byteRate) : null;
    o += 8 + size + (size & 1);
  }
  return null;
}

export async function readMediaInfo(file: Blob, ext: string): Promise<MediaInfo | null> {
  try {
    const seconds = ext === "mp4" || ext === "m4a" ? await mp4Duration(file) : ext === "webm" ? await webmDuration(file) : ext === "wav" ? await wavDuration(file) : null;
    return seconds ? { durationSeconds: seconds } : null;
  } catch {
    return null; // metadata is best effort — never fail an upload because of it
  }
}

export const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
