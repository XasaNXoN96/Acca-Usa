# Environment variables

Every variable the application and its operator commands read. **Names and meaning only — never put real values in Git, in this file, in
chat or in a ticket.** On a VPS they live in `/etc/acca-usa/acca-usa.env` (owner `root`, group `acca`, mode `0640`; see `docs/VPS_DEPLOYMENT.md`).
`.env.example` is the template with placeholders. At startup the server checks them (`src/lib/env-check.ts`) and, if something is wrong,
refuses to start and prints the **names** and reasons — never the values.

Legend: **R** = required in production · **O** = optional · **T** = tests/tools only.

## Three separate environments — never share secrets or databases

| | development | staging (optional but recommended) | production |
|---|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | `demo` | `production` | `production` |
| `DATA_PROVIDER` | `memory` (or `prisma` for DB work) | `prisma` | `prisma` |
| database | local, disposable | its **own** PostgreSQL database/user | its **own** PostgreSQL database/user |
| `AUTH_SECRET` | any (≥32 chars) | **own** random value | **own** random value, never reused |
| S3 bucket + keys | none / local MinIO | **own** bucket + keys | **own** bucket + keys |
| `PAYMENTS_PROVIDER` | – | `none`, or `stripe` with **test** keys | `none` first; `stripe` only after a deliberate decision |
| SMTP | none | a sandbox/sink or a test mailbox | the real sender domain |
| `APP_URL` | `http://localhost:3000` | `https://staging.<your-domain>` | `https://<your-domain>` |

Use a different `AUTH_SECRET` per environment: sessions and the encrypted MFA secrets of one environment must be unreadable in another.
`NEXT_PUBLIC_APP_MODE` is compiled into the bundle — build and run with the same value, and build staging and production separately.
The public Vercel demo uses `demo` mode and no variables at all; it must never receive production secrets.

## Core

| Name | | Meaning |
|---|---|---|
| `NEXT_PUBLIC_APP_MODE` | R | `production` on the VPS. `demo` = fictional data, simulated payments, no e-mail (never for real users). |
| `DATA_PROVIDER` | R | `prisma` in production (`memory` is demo-only; the server refuses it in production). |
| `DATABASE_URL` | R | `postgresql://USER:PASSWORD@HOST:5432/DBNAME` (a dedicated least-privilege role; URL-encode special characters in the password). |
| `AUTH_SECRET` | R | ≥32 random characters (`openssl rand -base64 48`). Signs session cookies and derives the key that encrypts administrators' MFA secrets. **Losing it = every session invalid and every MFA secret unreadable.** Back it up in a password manager, not in Git. |
| `AUDIT_CHAIN_SECRET` | O | Separate key for the audit hash chain (≥32 chars). Set it to the current `AUTH_SECRET` **before** rotating `AUTH_SECRET` (`docs/AUDIT.md`). |
| `APP_URL` | R | Public `https://` URL (links in e-mails, certificate QR codes, page metadata). Plain `http://` is refused in production. |
| `AUTH_URL` | O | Overrides the metadata base URL; defaults to `APP_URL`. |
| `MFA_REQUIRED` | O | `1` forces administrator two-step verification outside production too (always on in production). |
| `DEMO_LOGIN` | – | Must **not** be `1` in production (the server refuses to start). |
| `NODE_ENV` | R | `production` (set by the systemd unit). |
| `PORT` / `HOSTNAME` | O | Not used by the unit file: it starts `next start -H 127.0.0.1 -p 3000` explicitly. |

## Object storage (group `s3`) — uploaded materials, images, video

| Name | | Meaning |
|---|---|---|
| `S3_BUCKET` | R | Private bucket name. |
| `S3_REGION` | R | Region (`us-east-1` is fine for MinIO). |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R | Key limited to Get/Put/Delete on that bucket only. |
| `S3_ENDPOINT` | O | Custom endpoint for MinIO / R2 / other S3-compatible services, e.g. `http://127.0.0.1:9000`. |
| `S3_FORCE_PATH_STYLE` | O | `1` for MinIO and most self-hosted S3 (bucket in the path, not the host name). |

## E-mail (group `smtp`)

`SMTP_HOST` R · `SMTP_PORT` R (587 STARTTLS / 465 TLS) · `SMTP_USER` R · `SMTP_PASSWORD` R · `EMAIL_FROM` R (`ACCA USA <no-reply@your-domain>`) · `SMTP_SECURE` O (`1` = implicit TLS, use with port 465) · `EMAIL_TEST_TO` T.

## Payments (group `payments`) — see `docs/PAYMENTS.md`

| Name | | Meaning |
|---|---|---|
| `PAYMENTS_PROVIDER` | R | `none` (online payments off: no Stripe variable is needed, paid platforms show the contact notice, an administrator grants access in Admin → Access) or `stripe`. Missing or any other value = the server refuses to start. |
| `PAYMENT_SECRET_KEY` | R if `stripe` | `sk_test_…` or `sk_live_…`. Must be absent/unused with `none`. |
| `PAYMENT_WEBHOOK_SECRET` | R if `stripe` | `whsec_…` signing secret of `/api/webhooks/payments`. |
| `STRIPE_API_BASE` | T | Redirects Stripe calls to a local test double; refused with a live key. |

Access is granted only by a verified webhook or by an administrator's decision — never by a redirect or a client-side flag.

## Legal pages (group `legal`) — see `docs/LEGAL.md`

`LEGAL_OPERATOR_NAME` R · `LEGAL_CONTACT_EMAIL` R (also shown in the "online payment unavailable" notice) · `LEGAL_DATA_LOCATION` R (where the database, files and backups physically are — state the truth) · `LEGAL_OPERATOR_ADDRESS`, `LEGAL_OPERATOR_TAX_ID`, `LEGAL_GOVERNING_LAW`, `LEGAL_REFUND_WINDOW` O · `LEGAL_TEXTS_REVIEWED=1` O (only after a lawyer has reviewed the texts).

## Media processing (web app and `media:worker`) — see `docs/MEDIA.md`

| Name | Default | Meaning |
|---|---|---|
| `FFMPEG_PATH`, `FFPROBE_PATH` | `ffmpeg`, `ffprobe` on `PATH` | Only needed when the binaries are elsewhere. |
| `MEDIA_INLINE_PROCESSING` | on | `0` = the web process does **not** start processing after an upload; only the worker does. Recommended on the VPS when the worker service runs. |
| `MEDIA_CONCURRENCY` | `1` | Conversions at the same time per process. FFmpeg is CPU-heavy; keep 1 on a small VPS. |
| `MEDIA_POLL_SECONDS` | `15` | Worker polling interval with `--loop`. |
| `MEDIA_TRANSCODE_TIMEOUT_MS` | `1800000` | Kill one conversion after this long (→ `FAILED: TIMEOUT`, retried up to 3 times). |
| `MEDIA_STALE_MINUTES` | timeout + 5 | A file stuck in `PROCESSING` longer than this belongs to a dead worker and is taken over. |
| `MEDIA_TMP_DIR` | OS temp dir | Scratch space for the source copy + output. Needs ≈3× the largest video. The unit file uses `/var/lib/acca-media`. |
| `MEDIA_MIN_FREE_MB` | `128` | Extra free space required on top of 3× the file size; otherwise the file is marked `FAILED: NO_DISK_SPACE` (retry after freeing space). |
| `STT_PROVIDER`, `STT_API_KEY`, `STT_API_URL`, `STT_MODEL` | – | Optional speech-to-text (`docs/SPEECH_TO_TEXT.md`). Not configured = the feature says so; nothing is faked. |

## Operator commands (not read by the web app) — `docs/BACKUP_AND_RESTORE.md`

| Name | Used by | Meaning |
|---|---|---|
| `BACKUP_DIR`, `BACKUP_PASSPHRASE` (≥16 chars), `BACKUP_KEEP` | `db:backup`, `deploy/backup/backup.sh` | Target directory, encryption passphrase, how many own dumps to keep. |
| `BACKUP_REMOTE`, `FILES_SOURCE_REMOTE`, `FILES_REPLICA_REMOTE` | `deploy/backup/backup.sh` | Optional rclone targets: off-server copy of dumps, and bucket → second bucket copy. |
| `BACKUP_FILE`, `RESTORE_TARGET_URL` | `db:restore` | The dump to restore and the **new empty** database to restore into. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `ADMIN_ALLOW_ADDITIONAL`, `ADMIN_PROMOTE_EXISTING` | `admin:create` | Give them inline for one command; never store the password in a file. |

## Tests/CI only

`PG_ADMIN_URL`, `SMOKE_PORT`, `SMOKE_SHOTS`, `BASE_URL`, `CHROMIUM`, `NEXT_DIST_DIR`, `VERBOSE`.
`VERCEL*`, `AWS_LAMBDA_FUNCTION_NAME`, `NOW_REGION` are read only by the demo-mode session-secret fallback on serverless hosts; they are irrelevant on a VPS.
