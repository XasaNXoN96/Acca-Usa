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
* No malware scanning of uploads (type/signature checks only).
* Files have no automatic backup unless the operator configures the second bucket / versioning.
* Not "production ready": that claim requires the VPS drills above.

## After buying a server and a domain

1. Point DNS at the VPS; follow `docs/VPS_DEPLOYMENT.md` on a **staging** subdomain first (own DB, own secrets, own bucket).
2. Fill `/etc/acca-usa/acca-usa.env` on the server (secrets generated there); `PAYMENTS_PROVIDER=none`.
3. Run the upload drill (§10) and the backup/restore drills; fix what the real environment reveals.
4. Repeat for production; create the first administrator and enrol MFA; have a lawyer review the legal texts and set `LEGAL_TEXTS_REVIEWED=1`.
5. Tick `docs/PRODUCTION_CHECKLIST.md`; only then invite students.
