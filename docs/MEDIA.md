# Media (video / audio)

## Accepted files

| Kind | Extensions | Max size |
| --- | --- | --- |
| video | `mp4`, `webm` | 150 MB |
| audio | `mp3`, `wav`, `m4a`, `ogg` | 40 MB |

Validation is server-side (`validateUpload`): extension allow-list, size cap, magic-byte signature; the MIME type is derived
from the extension. Uploads go to the private storage provider (`docs/STORAGE.md`); students receive bytes only through
`/api/files/[id]`, with HTTP Range support so the player can seek.

## Metadata

Stored with each file (`StoredFile` in production, the JSON sidecar in demo):

| Field | Source |
| --- | --- |
| `mime`, `size`, `name` | validated upload (MIME from the extension) |
| `storageKey` | server-generated object key |
| `durationSeconds` | read from the container header by `services/storage/media-info.ts` |
| `thumbnailKey` | reserved; set by an out-of-process worker if you run one (nothing generates thumbnails in-process) |

Duration is parsed from `mp4/m4a` (`moov > mvhd`, also when `moov` is at the end of the file), `webm` (EBML `Info > Duration`)
and `wav`. For `mp3`/`ogg` it stays **unknown** and the UI simply omits it — a duration is never guessed. Verified against real
ffmpeg-produced files: `npm run test:media`.

## Playback

The viewer uses native `<video>` / `<audio>` (no autoplay, controls, keyboard accessible). Browsers decide codec support:

* Recommended encode for broad support: **MP4 / H.264 + AAC with `-movflags +faststart`** (metadata first, instant start and
  seeking). `webm` (VP8/VP9 + Opus) is accepted as an alternative.
* The server checks the **container**, not the codec. A file with an unsupported codec uploads fine but may not play in every browser.
* **Not verified here:** the Chromium used in CI has no H.264 decoder, so H.264 playback was not exercised in an automated browser
  run — only that the player renders, seeks via Range requests and shows its controls. Check one real lecture on Chrome, Safari
  and Firefox (desktop + mobile) in staging.

## Operational advice

* Transcode lectures before upload (HLS/adaptive streaming is a later step; it would add a segmenting worker and a CDN).
* Keep the bucket private; if you add a CDN, sign URLs with the same short TTL (`StorageProvider.signedUrl`).
