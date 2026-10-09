# Media (video / audio) — processing pipeline

## Accepted uploads

| Kind | Extensions | Max size |
| --- | --- | --- |
| video | `mp4`, `m4v`, `mov`, `webm`, `mkv`, `avi` | 150 MB |
| audio | `mp3`, `wav`, `m4a`, `aac`, `ogg`, `flac` | 80 MB |

`validateUpload()` (server): extension allow-list → size cap → magic bytes (container signature) → MIME derived from the
extension (the browser's `Content-Type` is ignored) → sanitised file name (no path separators, no `..`). Executables, SVG and
HTML are never accepted. This only proves the file *looks like* the container it claims to be; the pipeline below checks
what is really inside.

## Status model (`StoredFile.status`)

`UPLOADED → PROCESSING → READY` · `FAILED` (retryable, e.g. FFmpeg missing / crash / timeout) · `REJECTED` (content is not
usable media; never retried).

* Files of other kinds (PDF, image, text, …) are stored `READY`.
* **Nothing is served until `READY`** — `/api/files/[id]` answers `409` for every role; students see “being prepared”.
* Rows that existed before the pipeline were validated at upload and stay `READY` (migration default) — no data was changed.

## Pipeline (`src/services/media/*`)

1. Upload (`POST /api/uploads`) stores the original, then schedules `processFile(id)` with `after()`.
2. The original is streamed to a temp file (never held in memory) and read with **ffprobe**: container, video/audio codec,
   pixel format, width/height, duration.
3. `planMedia()` decides from container + codecs (not extension / MIME):
   * reject: no video/audio stream, no duration, > 6 h, > 4K → `REJECTED`
   * play as is: MP4/M4V + H.264 (yuv420p) + AAC/MP3 · WebM + VP8/VP9/AV1 + Opus/Vorbis · MP3, M4A/AAC, OGG Vorbis/Opus, WAV PCM, FLAC
   * otherwise **FFmpeg** transcodes: video → MP4 (H.264 yuv420p, AAC 128k, `+faststart`, even dimensions), audio → M4A (AAC)
4. A JPEG poster frame is extracted for videos.
5. Rendition and poster are stored as separate attached objects; the original keeps its id and records `playbackFileId`,
   `thumbnailFileId`, `container`, `videoCodec`, `audioCodec`, `width`, `height`, `durationSeconds`, `attempts`, `statusCode`.
6. `/api/files/[id]` streams the rendition (HTTP Range) to everyone; staff can still download the original with `?download=1`.

If FFmpeg/ffprobe are missing the file becomes `FAILED / FFMPEG_NOT_AVAILABLE` — **no success is simulated**; install the
binaries (or set `FFMPEG_PATH` / `FFPROBE_PATH`) and press *Retry processing* (`POST /api/media/[id]`) or run the worker.

### Queue / worker

The queue is the `StoredFile` table itself (`status IN (UPLOADED, FAILED with attempts < 3)`). In-process concurrency is
`MEDIA_CONCURRENCY` (default 1). For production run the worker next to the web app:

```
npm run media:worker            # one pass
npm run media:worker -- --loop  # poll every 15 s
```

Environment: `MEDIA_TMP_DIR` (temp files, default OS temp), `MEDIA_TRANSCODE_TIMEOUT_MS` (default 30 min).

### Streaming architecture / HLS

Delivery today is progressive MP4/WebM with HTTP Range from the private bucket through the authorised `/api/files` route.
HLS/adaptive streaming is **not implemented**; the planned path is: worker emits `.m3u8` + `.ts/.m4s` segments next to the
rendition (FFmpeg `-f hls`), `/api/files` (or a signed CDN URL issued after the same access check) serves playlists/segments.

## Playback & protection

Native `<video>`/`<audio>` with controls (play/pause, seek, volume, fullscreen, time); `controlsList="nodownload"`, no
picture-in-picture, context menu blocked, personal watermark overlay on video. These are **deterrents**: a determined user can
still screen-record. The watermark identifies the source of a leak, it does not prevent copying.

Not verified here: the CI Chromium has no H.264 decoder, so actual H.264 playback was not exercised in an automated browser —
only that the player renders, the rendition is `video/mp4` H.264/AAC (checked with ffprobe) and Range requests work. Check one
real lecture on Chrome, Safari, Firefox (desktop + mobile) in staging.

## Tests

* `npm run test:media-pipeline` — real ffmpeg: 12 formats (mp4, webm, mkv, mov, avi, 4:4:4 mp4, mp3, m4a, wav, flac, ogg,
  aac), corrupt file, audio-only-as-video, spoofed executable, FFmpeg missing → FAILED → retry, idempotency.
* `smoke-materials` — admin uploads `.mkv` through the UI, student streams the MP4 rendition, corrupt upload is `REJECTED`.
* `npm run test:media` — container-header duration reader (kept for quick pre-checks).

## Known limits

* The upload endpoint reads the multipart body with `request.formData()`, i.e. the file is buffered in memory once
  (≤ 160 MB). The pipeline itself streams. Direct-to-bucket (presigned multipart) upload would remove this; not implemented.
* No antivirus is connected (see `docs/STORAGE.md`); content checks are signature + ffprobe only.
* Subtitles/transcripts: see `docs/SPEECH_TO_TEXT.md`.
