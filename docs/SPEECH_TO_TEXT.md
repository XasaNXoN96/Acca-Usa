# Transcripts, subtitles and speech-to-text

## What exists

| Feature | State |
| --- | --- |
| Transcript per video/audio material (`Transcript`: language, status QUEUED/PROCESSING/COMPLETED/FAILED, provider, `[{start,end,text}]`) | implemented, both providers |
| Admin edits the transcript by hand (`MM:SS text` per line) | implemented — stored as provider `manual` |
| Students read the transcript next to the player; clicking a time seeks the media | implemented |
| Subtitle tracks per language (EN/RU/UZ): upload `.vtt`/`.srt` (converted to clean WebVTT), create from transcript, enable/disable, delete | implemented |
| Video without subtitles plays normally | yes |
| Automatic speech-to-text | **adapter implemented, NOT CONNECTED by default** |

Admin UI: *Materials → (video/audio row) → Transcript & subtitles* (`/admin/materials/[id]/media`). When no provider is
configured the page says **“Speech-to-text: NOT CONNECTED”** and the *Generate* button is disabled; the API answers
`503 STT_NOT_CONNECTED` and queues nothing. There is **no demo/fake transcriber**: text is either written by an
administrator or returned by a real provider.

## Connecting a provider

`SpeechToTextProvider` (`src/services/speech/contracts.ts`) has one adapter, `openai-compatible` (any service exposing
`POST {STT_API_URL}/audio/transcriptions` with `response_format=verbose_json`):

```
STT_PROVIDER=openai-compatible
STT_API_KEY=...            # server only, never sent to the browser, never logged
STT_API_URL=https://api.openai.com/v1   # optional
STT_MODEL=whisper-1                      # optional
```

Flow: request → `QUEUED` → `PROCESSING` (FFmpeg extracts mono 16 kHz MP3 from the playable rendition into a temp dir; the
file is sent to the provider) → `COMPLETED` with segments, or `FAILED` with a code (`STT_REQUEST_FAILED`,
`STT_BAD_RESPONSE`, `STT_TIMEOUT`, `FFMPEG_NOT_AVAILABLE`, …). The administrator reviews and edits the result before
creating subtitles from it. Audio leaves your infrastructure when a provider is connected — mention it in the privacy policy.

## Verification status

* Parsing, SRT→VTT, transcript text, provider selection, request shape, error handling and the QUEUED→COMPLETED/FAILED flow are
  tested (`npm run test:media-text`) against a **local fake HTTP endpoint**.
* **NOT VERIFIED** against a real vendor (no credentials in this environment).

## Access control

Subtitle files are served by `GET /api/materials/[id]/subtitles/[lang]` with the same rule as the media file (session +
active enrolment + unlocked topic; guest 401, not enrolled 403, disabled track 404). Admin APIs are staff-only.
