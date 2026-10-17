import { Transform } from "node:stream";

export class UploadSizeError extends Error {
  constructor(readonly maxBytes: number) { super("SIZE"); this.name = "UploadSizeError"; }
}

/** Passes bytes through, counts them, and fails the stream the moment `maxBytes` is exceeded (so a lying Content-Length changes nothing). */
export function countingStream(maxBytes: number): Transform & { bytes: number } {
  let bytes = 0;
  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      t.bytes = bytes;
      if (bytes > maxBytes) return cb(new UploadSizeError(maxBytes));
      cb(null, chunk);
    },
  }) as Transform & { bytes: number };
  t.bytes = 0;
  return t;
}
