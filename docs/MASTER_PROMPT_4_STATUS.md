# Master Prompt 4 — status of the documentation and the work (phases 0–27)

Scope covered so far: phases 0–27. **Phases 28–47 (dashboards / learning / preparation plan / analytics, security-a11y-responsive-i18n
sweeps, performance, pricing, brand configuration, final regression, real-service validation, release check, final documentation) are
NOT started** and need the owner's confirmation.
"Tested" below means the suites listed in `docs/QA.md` ran on both data providers (in-memory and PostgreSQL) — see the final
report of the session for the exact commit and results. **Nothing here is "production ready":** every external integration is
listed separately below as CONNECTED / TESTED / NOT TESTED.

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
| 19–20 | Stripe **test mode** only (live keys refused for the API override), checkout → webhook → ledger → access, idempotency, replays, amount/currency checks, refunds (full withdraws access, partial keeps it), payments admin ledger with provider/mode badge | `docs/PAYMENTS.md` |
| 21–22 | SMTP + e-mail: validated config, classified failures (no credentials in logs), bounded retry, process-local counters, safe templates, admin test message to the admin's own address only (rate-limited) | `docs/EMAIL.md` |
| 23 | Safe first administrator: `npm run admin:create` (password from env, never argv; refuses a second admin / a student's e-mail without explicit flags), no public admin registration | `docs/AUTH.md` |
| 24 | Administrator two-step verification (TOTP, recovery codes, encrypted secret, replay protection, rate limits), enforced in the session layer, mandatory in production, `admin:mfa-reset` | `docs/AUTH.md` |
| 25 | Tamper-evident admin audit log: append-only (DB triggers), keyed hash chain, read-only admin view, `audit:verify` | `docs/AUDIT.md` |
| 26 | PostgreSQL `db:backup` (checksum manifest, optional AES-256-GCM) and `db:restore` (only into an empty non-live database, single transaction, post-restore verification incl. audit chain) | `docs/BACKUP_RESTORE.md` |
| 27 | Terms / Privacy+consent / Cookie / Refund pages (EN/RU/UZ, operator details from env), separate versioned consents with evidence, consent gate, privacy settings | `docs/LEGAL.md` |

Security fixes found during verification: simultaneous exam starts could create several attempts (PostgreSQL) — fixed with a
per-learner advisory lock; illustrations of scheduled / closed exams are no longer served; PostgreSQL "duplicate exam" lost
the window and review policy; sample exams removed from both providers.

## External integrations — CONNECTED / TESTED / NOT TESTED

| Integration | Code | Tested here against | Real account / service |
| --- | --- | --- | --- |
| Stripe (test mode) | yes (REST adapter, signed webhook) | a **local Stripe test double** + signed webhooks (`test:production`, `test:payments`, `smoke-payments`) | **NOT TESTED** — no Stripe test account/keys in this environment; live mode never used |
| SMTP / e-mail | yes (nodemailer) | a **local SMTP sink** (delivery, outage, no secret in logs) | **NOT TESTED** — no real mailbox/provider; SPF / DKIM / DMARC not checked |
| S3-compatible storage | yes | local test doubles (`test:storage`) | **NOT TESTED** against a real bucket |
| Speech-to-text | interface only | local fake endpoint | **NOT CONNECTED** (UI says so; nothing simulated) |
| Antivirus | status hook only | — | **NOT CONNECTED** |
| TOTP authenticator apps | yes | RFC 6238 vectors + an independent generator in the browser tests | not tried with a vendor app on a real device |
| PostgreSQL backup / restore | yes | local PostgreSQL 16 (`test:backup`, 9 checks) | **NOT TESTED** on a managed service or production-size data |
| Local card schemes / wallets for Uzbekistan | no | — | **NOT INTEGRATED**; Stripe availability for the operating entity must be confirmed |

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
* The legal texts are **drafts** (no lawyer reviewed them); data residency for Uzbekistan, operator registration, retention periods,
  e-fiscal receipts and the form of the agreement (offer) are open decisions — `docs/LEGAL.md`.
* Not started: README rewrite for the final release, performance pass, pricing/brand configuration (phases 28–47).

## Known limits of phases 13–18

* Scheduled materials / exams do not send a notification at the moment they open (no scheduler).
* Exam times are entered in UTC; no proctoring.
* Notes are private: administrators have no read path (by design).
* Views before the analytics feature existed are unknown (shown as 0).

## Known limits of phases 19–27

* Audit records are written *after* an action; a failed write is logged (`audit.write_failed`) but does not undo the action. The in-memory demo audit log is lost on restart. Tail truncation of the audit chain needs an external anchor (`docs/AUDIT.md`).
* MFA: no self-service "disable" / "regenerate recovery codes"; loss of both device and codes needs an operator (`admin:mfa-reset`). Rotating `AUTH_SECRET` makes stored TOTP secrets unreadable.
* Consent: no self-service data export / account deletion; no IP/user-agent stored with consent (by design); changing a text means bumping `LEGAL_VERSIONS`.
* Backups cover the database only (not uploaded files, not secrets); no scheduler is shipped; restore time on large data is unmeasured.
* E-mail counters and the Stripe/SMTP "health" are per process (not shared across instances).
