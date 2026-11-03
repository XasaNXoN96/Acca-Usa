# Deployment status — self-hosted VPS

Honest status of the preparation for a future VPS deployment. **Nothing has been deployed anywhere.** No server, domain, production database,
S3/MinIO, SMTP provider or payment account exists yet; no secret was created or requested. The public Vercel demo was not touched.
Report convention: **CONNECTED** = talked to the real external service · **TESTED** = exercised locally against a stand-in · **NOT TESTED**.

## Prepared in the repository

| Area | State |
|---|---|
| Production start | `next start -H 127.0.0.1` under systemd (`deploy/systemd/acca-usa-web.service`); config refuses to start with missing/unsafe variables (names only in the log) — TESTED (`test:env`, `test:production`) |
| Separate media worker | `npm run media:worker [-- --loop]` + `deploy/systemd/acca-usa-media-worker.service` — worker TESTED locally (below); unit file NOT TESTED on systemd |
| Environments | dev / staging / production separation, per-environment secrets and databases documented (`docs/ENVIRONMENT_VARIABLES.md`) |
| Payments | `PAYMENTS_PROVIDER=none\|stripe`; `none` needs no payment keys and grants no access automatically — TESTED |
| Health check | `GET /api/health` (liveness), `?ready=1` (database) — TESTED against PostgreSQL |
| Nginx / HTTPS | `deploy/nginx/acca-usa.conf` (170 MB body, no request buffering, trusted client IP) — NOT TESTED (no Nginx run) |
| Backups | DB dump/restore TESTED; `deploy/backup/backup.sh` logic TESTED with a stub rclone; real off-server and file backups NOT TESTED |
| Docs | `VPS_DEPLOYMENT`, `ENVIRONMENT_VARIABLES`, `BACKUP_AND_RESTORE` (+ `FILES_BACKUP`), `PRODUCTION_CHECKLIST`, this file |

## Upload and media pipeline (what was really measured)

Local lab: production build (`NEXT_PUBLIC_APP_MODE=production`), PostgreSQL 16, the *moto* S3 emulator (**not** MinIO/AWS), real FFmpeg.

| Check | Result |
|---|---|
| 107 MB video, 67 MB audio, 24 MB PDF upload through `/api/uploads` | OK; server memory grew ≈100 MB for the 107 MB video instead of ≈375 MB before the streaming rewrite |
| Oversize body (27 MB "PDF", cap 25 MB) | `413 {"code":"SIZE"}`, no object, no DB row (found and fixed a hang here) |
| Declared Content-Length > 160 MB | `413` before reading the body |
| Renamed/spoofed file (text as `.mp4`, bad PDF) | `422 SIGNATURE`; wrong extension `TYPE`; MIME derived from the extension, never from the client |
| Not staff / foreign Origin / `file` before `kind` / non-multipart | `403` / `403` / `400` / `400` |
| Storage backend down | `500 {"ok":false,"code":"FAILED"}`, nothing leaked, logged as a code only |
| Worker: UPLOADED → READY (copy, probe, transcode, poster) | OK incl. MKV→MP4 |
| Worker `SIGTERM` during conversion | FFmpeg stopped in <1 s, exit code 0, file back to `UPLOADED` with the attempt refunded, temp dir removed, next pass completes it |
| Two workers racing; stale `PROCESSING` recovery; low disk → `NO_DISK_SPACE`; shutdown skips new files | automated: `npm run test:upload-stream` (9 checks) |
| Uploads in the end-to-end production suite | `npm run test:production` (28 steps, includes the new upload step) |

## Pre-launch hardening round (what was done and verified)

| Area | Result |
|---|---|
| Dependencies | Next.js 16.4.0 → 16.4.4 (critical RCE / DoS advisories), nodemailer → 10.3, zod → 4. `npm audit` still lists the Prisma CLI's `deepmerge-ts` (migration tooling only, needs a Prisma 7 major upgrade) and lint-time packages. |
| Antivirus | ClamAV integration (`test:antivirus`, real clamd with a test signature checked once). Explicit `ANTIVIRUS_PROVIDER`. **Real signature database: NOT TESTED** (no internet in the sandbox). |
| Attack probes | `scripts/security-probe.mjs`: 48 probes (headers, anonymous access, traversal, open redirect, forged cookies, CSRF on upload, spoofed / script / SVG uploads, NUL-byte file name, multi-range, unsatisfiable range) — all pass. **Found and fixed:** a malformed upload (NUL byte in the file name) made the request hang forever (DoS path). |
| Passwords | the most guessed passwords are refused (registration, reset, admin form, `admin:create`). Gap kept on purpose: no e-mail verification at sign-up (anyone can register with someone else's address; the owner can still reset the password). |
| Registration | `scripts/registration-probe.mjs`: 21 checks (valid sign-up, cookie flags, HTML / SQL-looking names, duplicate e-mail in another case, plus-addresses, weak / common / mismatched passwords, name / e-mail limits, missing consents, unicode e-mail, RU / UZ messages, no enumeration on password reset, rate limit) — all pass. Sign-up still reveals "an account with this e-mail already exists" (usual trade-off). |
| Materials of every type | all 24 allowed formats (6 video, 6 audio, 4 image, pdf, slides pdf/pptx, docx, xlsx, zip, txt, csv) uploaded through the production build with antivirus on, processed by real FFmpeg and read back with Range: all `READY` and served. Admin guide: `docs/ADMIN_GUIDE_RU.md`. Staff upload limit raised to 600/h (an administrator loading a course hit 60/h). |
| Devices | `audit-responsive` (overflow, clipped content, tiny touch targets, public + student + admin pages): 315–3840 px, landscape phones, tablets, RU / UZ / EN — **0 problems** after fixing two Russian-text overflows in the admin. |
| Performance | catalogue snapshot shared between requests (+40 % page throughput), smaller HTML (admin-only texts not sent to everyone), compression moved to Nginx, optional Nginx video offload. Details and limits: `docs/LOAD_AND_CAPACITY.md`. A tried access-decision cache for files was **reverted** because it let a student read an old file version for a few seconds (caught by `smoke-examsecurity`). |
| Nginx config | validated with a real Nginx 1.24 (`nginx -t`, run, HTTP/2, gzip, HSTS, large uploads, internal offload location). **Found and fixed:** `http2 on;` does not exist in Ubuntu 24.04's nginx 1.24. |
| Regression | `smoke:all` 33/33, `test:production` 28/28, integration, migration, backup and restart suites — see the final report for the last run. |

## December preparation round (what was added and verified)

| Area | Result |
|---|---|
| Prices in sum | `PRICE_CURRENCY=USD|UZS`; whole-sum formatting; admin limit 20 000 000 (32-bit minor units); `smoke-payments` passes in USD and UZS |
| Question import | CSV (RU/EN headers, `, ; tab`), check-then-import as drafts, row-level errors, duplicates skipped, 2 MB / 2000 rows; `test:question-import` + `smoke-questionimport` on memory **and** PostgreSQL; 300 questions created in 0.8 s |
| zod 3 → 4 | closes the DoS advisory; the whole suite passes on it (see the final run below) |
| Payme | Merchant API endpoint + hosted-checkout link + `PaymeTransaction` table; `test:payme` (mutation-checked) and `test:production` against the real server + PostgreSQL. **NOT TESTED against Payme itself** — no merchant account existed; Payme's own certification checks are mandatory (`docs/PAYMENTS.md`, `docs/LAUNCH_DAY.md`). Fiscal receipts: not implemented |
| E-mail confirmation | banner + refused online purchase until confirmed, single-use 48 h link, resend limit; tested in `test:production`; real mailbox delivery **NOT TESTED** |
| Preflight | `npm run preflight` (config, PostgreSQL + migrations, bucket write/read/delete, SMTP login, FFmpeg encoders, ClamAV, disks, public site headers, closed ports); shown OK on a healthy lab and FAILing for each broken part |
| Monitoring | `deploy/monitoring/monitor.sh` + systemd timer: site/DB, disk, certificate, backup age, ClamAV, services; alert / no-repeat / recovery tested; Telegram and `systemctl` checks **NOT TESTED** |
| SEO | `SEO_INDEX=1` switches on indexing, `robots.txt`, `sitemap.xml`; default stays "not indexed" |
| Runbook | `docs/LAUNCH_DAY.md` |

Still open: Payme certification; fiscal receipts; real SMTP/spam behaviour; everything in "Not verifiable before a VPS exists".

## Not verifiable before a VPS exists

* Real Nginx behaviour (body limits, timeouts, `proxy_request_buffering off`), `nginx -t` on the shipped file, certbot/Let's Encrypt, DNS.
* systemd units (hardening options such as `ProtectSystem=strict` may need adjusting), reboot autostart, journald limits, `ufw`/SSH hardening.
* Real MinIO or provider S3: multipart behaviour, versioning, lifecycle, bucket policies, throughput on the actual disk/network.
* Real SMTP delivery and SPF/DKIM/DMARC; real Stripe (not needed for `none`).
* FFmpeg speed on the VPS's CPU; disk sizing for a real video library; behaviour of 150 MB uploads over slow mobile connections.
* Off-server backup transport (rclone and remote), file restore drills, a full "server lost" rehearsal.
* Data-residency/legal suitability of the chosen provider and country (`docs/LEGAL.md`; legal texts are drafts until a lawyer reviews them).

## Known gaps / risks

* Queue is the `StoredFile` status table polled by the worker (no Redis/BullMQ): fine for one server, not horizontally scalable beyond a few workers.
* Dev tools (`tsx`, `prisma`) are devDependencies, so the server installs all dependencies (`npm ci`); larger `node_modules`, accepted.
* No HLS/adaptive streaming; progressive MP4 with Range requests only (`docs/MEDIA.md`).
* Antivirus works (ClamAV, `docs/ANTIVIRUS.md`) but was verified only with a test signature, not the real database.
* Files have no automatic backup unless the operator configures the second bucket / versioning.
* Not "production ready": that claim requires the VPS drills above.

## After buying a server and a domain

1. Point DNS at the VPS; follow `docs/VPS_DEPLOYMENT.md` on a **staging** subdomain first (own DB, own secrets, own bucket).
2. Fill `/etc/acca-usa/acca-usa.env` on the server (secrets generated there); `PAYMENTS_PROVIDER=none`.
3. Run the upload drill (§10) and the backup/restore drills; fix what the real environment reveals.
4. Repeat for production; create the first administrator and enrol MFA; have a lawyer review the legal texts and set `LEGAL_TEXTS_REVIEWED=1`.
5. Tick `docs/PRODUCTION_CHECKLIST.md`; only then invite students.
