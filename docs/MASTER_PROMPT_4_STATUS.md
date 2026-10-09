# Master Prompt 4 — status of the documentation and the work (phases 0–18)

Scope covered so far: phases 0–18. **Phases 19–47 (Stripe test flow, payment admin, SMTP, first admin, MFA, audit log,
backup/restore, legal pages, dashboards, security/a11y/responsive/i18n sweeps, performance, env validation, demo/production
separation, pricing, brand config, final regression, real-service validation, release check, final documentation) are NOT started.**
"Tested" below means the suites listed in `docs/QA.md` ran on both data providers (in-memory and PostgreSQL) — see the final
report of the session for the exact commit and results.

## IMPLEMENTED (code + tests)

| Phase | What | Documentation |
| --- | --- | --- |
| 0 | baseline regression (lint, typecheck, check, build, smoke:all) | `docs/QA.md` |
| 2–4, 9 | View-only student materials (no download/open-original, server refuses `?download`), controlled pdf.js reader (canvas, page/zoom, no browser toolbar), personal watermark (abbreviated name · tag · date) on PDF / image / video | `docs/MEDIA.md`, `docs/STORAGE.md`, `docs/ACCESS_CONTROL.md` |
| 5–6, 10 | Media pipeline: ffprobe + FFmpeg, statuses UPLOADED→PROCESSING→READY/FAILED/REJECTED, browser-compatible rendition, poster frame, worker, retry; file allow-lists / magic bytes / sanitised names | `docs/MEDIA.md` |
| 7–8 | Transcripts, SRT/VTT subtitles (RU/EN/UZ), speech-to-text interface | `docs/SPEECH_TO_TEXT.md` |
| 13 | Draft / scheduled / published materials, ordering, preview as student, bulk upload | `docs/CONTENT_MANAGEMENT.md` |
| 14 | Material version history, safe replacement, restore | `docs/CONTENT_MANAGEMENT.md` |
| 15 | Material analytics from real events (views, completions, processing errors, topic test attempts) | `docs/CONTENT_MANAGEMENT.md` |
| 16 | Private student notes (page / media time anchors) | `docs/CONTENT_MANAGEMENT.md` |
| 17 | Review of wrong answers + server-graded practice | `docs/QA.md` |
| 18 | Exam builder: window (UTC), deadline, attempt limit, review policy, publish/duplicate/archive | `docs/EXAMS.md` |

Security fixes found during verification: simultaneous exam starts could create several attempts (PostgreSQL) — fixed with a
per-learner advisory lock; illustrations of scheduled / closed exams are no longer served; PostgreSQL "duplicate exam" lost
the window and review policy; sample exams removed from both providers.

## READY FOR CONFIGURATION (code exists, needs your environment)

* **FFmpeg / ffprobe** on the server (or `FFMPEG_PATH` / `FFPROBE_PATH`); run `npm run media:worker` next to the app. Without
  them uploaded video/audio stay `FAILED / FFMPEG_NOT_AVAILABLE` (nothing is simulated).
* **Speech-to-text:** `STT_PROVIDER=openai-compatible`, `STT_API_KEY`, optional `STT_API_URL`, `STT_MODEL`. Until set the UI says
  **NOT CONNECTED** and no transcript is generated.
* Existing production wiring from earlier work: S3-compatible storage (`S3_*`), SMTP (`SMTP_*`, `EMAIL_FROM`), Stripe
  (`PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`) — see `docs/PRODUCTION_CHECKLIST.md`.

## NOT CONNECTED

* Speech-to-text vendor, antivirus scanner (only the status hook is documented), real Stripe / S3 / SMTP accounts in this
  environment, HLS/adaptive streaming, external job queue (the queue is the `StoredFile` status table + `media:worker`).

## NOT VERIFIED

* Real Stripe (test or live), real S3 bucket, real SMTP delivery, a real speech-to-text vendor (only a local fake endpoint was used).
* H.264 playback in a browser (the CI Chromium has no H.264 decoder): the conversion output is checked with ffprobe, the player is
  checked with VP9/WebM; verify one real lecture on Chrome, Safari, Firefox (desktop + mobile).
* Manual QA with real content, real devices and screen readers; multi-instance deployment behaviour; large-file upload limits
  (the upload route still buffers the multipart body once, ≤ 160 MB).
* Documents still to be written for phases 19–47: `BACKUP_RESTORE.md`, `LEGAL.md`, `ADMIN_AUDIT.md`, final updates of the
  README and of `SECURITY_AUDIT.md` / `PRODUCTION_CHECKLIST.md` for the new features.

## Known limits of phases 13–18

* Scheduled materials / exams do not send a notification at the moment they open (no scheduler).
* Exam times are entered in UTC; no proctoring.
* Notes are private: administrators have no read path (by design).
* Views before the analytics feature existed are unknown (shown as 0).
