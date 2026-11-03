# Deploying ACCA USA on your own Linux VPS

Audience: someone doing this for the first time. Target: **one Ubuntu LTS server (24.04 or 22.04)**, your own domain, everything on the
one machine except (optionally) the object storage. Docker is **not** used: the repository ships no Docker setup, and this guide
deliberately maintains one scheme only (systemd + Nginx).

> **Status: prepared, not rehearsed on a real server.** The application, upload pipeline, worker and backup tools were tested locally
> (`docs/DEPLOYMENT_STATUS.md` lists exactly what). The commands below are standard Ubuntu administration but have **not** been executed
> on a VPS from this repository. Read `docs/DEPLOYMENT_STATUS.md` ("Not verifiable before a VPS exists") first, and do the whole
> procedure first on a **staging** server or subdomain before real students use it.
>
> Never paste passwords, keys or the contents of `/etc/acca-usa/*.env` into chat, tickets, Git or this file.

## 0. What you will end up with

```
Internet ──443──► Nginx (TLS, upload limits, trusted client IP)
                    └──► 127.0.0.1:3000  acca-usa-web      (next start; systemd)
                                     ├──► PostgreSQL 127.0.0.1:5432   (data)
                                     └──► S3-compatible storage       (uploaded files, private)
                         acca-usa-media-worker (systemd)  ── ffprobe/FFmpeg ── same DB + storage
                         acca-usa-backup.timer (systemd)  ── nightly encrypted DB dump (+ optional off-server copies)
```

Only ports 22 (SSH), 80 and 443 are open to the internet. PostgreSQL, MinIO and the Node app listen on `127.0.0.1` only.

Sizing (the plan: **2 vCPU / 8 GB RAM / 80 GB NVMe**):

| Part | RAM | Disk |
|---|---|---|
| Ubuntu + Nginx + Node app (`next start`) | ≈ 0.6–1 GB | ≈ 6 GB (system) + 2 GB (code, `node_modules`, `.next`) |
| PostgreSQL | ≈ 0.5–1 GB (set `shared_buffers` ≈ 1 GB) | ≈ 1–3 GB at first, grows with students and progress |
| ClamAV daemon (`clamd`) | ≈ 1.5–2 GB (signatures live in RAM) | ≈ 0.4 GB |
| FFmpeg while converting a video | 0.3–1 GB per job (the worker runs **one** job at a time) | working copy ≈ 3× the video |
| MinIO (if on the same server) | ≈ 0.3–0.5 GB | **the rest** |
| Backups of the database (encrypted dumps, 7–14 kept) | – | ≈ 1–5 GB |

Disk budget on 80 GB: ≈ 12 GB for system, code, PostgreSQL, ClamAV signatures, logs and database backups; ≈ 8 GB must stay **free** (conversion scratch space
and headroom); that leaves **≈ 60 GB for video and documents**. Every uploaded video is stored twice when FFmpeg has to convert it (original + MP4 copy), and a
video that is already browser-ready is stored once. Plan therefore for **≈ 30–40 GB of original lecture video** — roughly 40–50 hours at 720p (≈ 0.7–1 GB per hour) —
before you must add disk (a block-storage volume mounted for MinIO, or provider object storage; MinIO's `S3_ENDPOINT` just moves). Compress lecture video before upload
(720p, H.264, ≈ 2 Mbit/s is plenty for lessons) and delete test uploads. **CPU:** two cores are enough for the site and for a conversion at a time, but a conversion
makes pages slower while it runs — keep `MEDIA_CONCURRENCY=1` and let the worker run at night when you upload large batches.

**Network is the limit for video, not CPU.** One student watching 720p uses ≈ 2–2.5 Mbit/s. A 100 Mbit/s uplink serves ≈ 40 viewers, 1 Gbit/s ≈ 400. Ask the provider
for the **guaranteed** uplink and the monthly traffic allowance *before* buying (a plan with 10 Mbit/s cannot serve video at all), and see `docs/DEPLOYMENT_STATUS.md` for the
measured capacity of the application itself. Provider, region, IP and domain are your choice; nothing here depends on one.

## 1. Before you start (decisions and accounts)

| Decision | Notes |
|---|---|
| Domain + DNS | `A`/`AAAA` records for `example.com` (and `www`) pointing to the VPS IP. Needed before the certificate step. |
| Where the data lives | Write it into `LEGAL_DATA_LOCATION` truthfully (`docs/LEGAL.md`). |
| File storage | **A)** MinIO on the same VPS (step 6a) — simplest, but a single disk. **B)** a provider's S3-compatible service — better durability. Either way the bucket is private. |
| E-mail (SMTP) | Mandatory at startup. Use a transactional provider or your own mail server; set SPF/DKIM/DMARC for the sender domain. |
| Payments | Start with `PAYMENTS_PROVIDER=none` (no Stripe keys, access granted by an administrator in Admin → Access). |
| Off-server backups | A second place (another provider/account) for dumps and file copies. Without it a lost VPS = lost data. |

## 2. First login and basic hardening

Do this as soon as the server exists. Use the provider console if you lock yourself out.

```bash
# on your own computer: create an SSH key if you have none, then install it on the server
ssh-keygen -t ed25519 -C "acca-admin"
ssh-copy-id root@SERVER_IP            # or paste the PUBLIC key into the provider's panel

# on the server
adduser --disabled-password --gecos "" deploy && usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && cp /root/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-deploy      # or set a password and omit this line
```

Open a **second terminal** and confirm `ssh deploy@SERVER_IP` works **before** closing the root session. Then:

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
EOF
sudo sshd -t && sudo systemctl reload ssh      # `sshd -t` prints nothing when the file is valid

sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable && sudo ufw status verbose

sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades fail2ban ca-certificates curl gnupg ufw
sudo dpkg-reconfigure -plow unattended-upgrades
sudo systemctl enable --now fail2ban
```

Optional: change the SSH port (then allow it in `ufw` first). Keep the provider's console/rescue access in mind.

## 3. Software

```bash
# Node.js 22 LTS (the app needs >= 20.9; NodeSource shown — check https://github.com/nodesource/distributions for the current command)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs build-essential

sudo apt -y install postgresql postgresql-contrib nginx ffmpeg git certbot python3-certbot-nginx clamav clamav-daemon netcat-openbsd

node -v && psql --version && ffmpeg -version | head -1 && ffprobe -version | head -1 && nginx -v
```

Ubuntu's `ffmpeg` package includes `libx264` and the AAC encoder the pipeline uses. Check: `ffmpeg -hide_banner -encoders | grep -E "libx264|aac"`.

Antivirus: finish the ClamAV setup from `docs/ANTIVIRUS.md` (first signature download, `StreamMaxLength 200M`, loopback-only) **before** step 8, and set `ANTIVIRUS_PROVIDER=clamav` in the env file.

## 4. System user and directories

```bash
sudo useradd --system --create-home --home-dir /home/acca --shell /usr/sbin/nologin acca
sudo mkdir -p /srv/acca-usa /etc/acca-usa /var/backups/acca-usa
sudo chown acca:acca /srv/acca-usa
sudo chown acca:acca /var/backups/acca-usa && sudo chmod 700 /var/backups/acca-usa
sudo chown root:acca /etc/acca-usa && sudo chmod 750 /etc/acca-usa
```

## 5. PostgreSQL

Create a dedicated role and database. The password is typed at a prompt, so it never lands in shell history or argv:

```bash
sudo -u postgres createuser --pwprompt acca_app        # prompts twice for the password
sudo -u postgres createdb --owner acca_app acca_usa
sudo -u postgres psql -c "SELECT current_setting('listen_addresses');"     # default 'localhost' → good; never open 5432 in ufw
```

Connection check (prompts for the password; `\q` to leave):

```bash
psql "postgresql://acca_app@127.0.0.1:5432/acca_usa" -c "SELECT 1;"
```

`DATABASE_URL` is `postgresql://acca_app:PASSWORD@127.0.0.1:5432/acca_usa` (URL-encode special characters in the password).
Use a **separate database and role for staging**; never point staging at the production database.

## 6. File storage

Uploaded materials must live in a **private** S3-compatible bucket (`docs/STORAGE.md`). Two options:

### 6a. MinIO on the same VPS (single binary; follow the vendor's current install page)

Install MinIO per https://min.io/docs/minio/linux/index.html, run it as its own user with data in a dedicated directory
(e.g. `/srv/minio-data`), bound to `127.0.0.1:9000` (`--address 127.0.0.1:9000 --console-address 127.0.0.1:9001`), put its
`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in `/etc/minio/minio.env` (mode 0600, **not** the application's env file), then with the `mc` client:

```bash
mc alias set local http://127.0.0.1:9000 ROOT_USER            # prompts for the password
mc mb local/acca-files
mc anonymous set none local/acca-files                        # private
mc admin user add local acca-app                              # prompts: the application's access key / secret
mc admin policy create local acca-files-rw policy.json        # allow only s3:GetObject/PutObject/DeleteObject/ListBucket on acca-files
mc admin policy attach local acca-files-rw --user acca-app
mc version enable local/acca-files                            # versioning: a deleted/overwritten file stays recoverable
```

The application then uses `S3_ENDPOINT=http://127.0.0.1:9000`, `S3_FORCE_PATH_STYLE=1`, `S3_REGION=us-east-1`, `S3_BUCKET=acca-files` and the `acca-app` key.
Verified locally only with the *moto* S3 emulator, **not** with a real MinIO — do one real upload + download + seek on staging.

### 6b. A provider's S3-compatible storage

Create a private bucket and an access key limited to that bucket; set `S3_ENDPOINT` (if not AWS), `S3_REGION`, `S3_BUCKET`, the key pair, and
`S3_FORCE_PATH_STYLE=1` if the provider needs path-style URLs. Enable versioning where available.

## 7. Get the code, configure, build

```bash
sudo -u acca git clone <YOUR_REPOSITORY_URL> /srv/acca-usa      # a private repo needs a read-only deploy key
cd /srv/acca-usa && sudo -u acca git checkout <the branch or tag you decided to deploy>
sudo -u acca npm ci                                              # all dependencies: the worker and migrations use tsx and prisma
```

Create the environment file **on the server** with an editor (`sudo nano /etc/acca-usa/acca-usa.env`) using `.env.example` and
`docs/ENVIRONMENT_VARIABLES.md` as the guide; generate secrets there (`openssl rand -base64 48`). Then lock it down:

```bash
sudo chown root:acca /etc/acca-usa/acca-usa.env && sudo chmod 640 /etc/acca-usa/acca-usa.env
```

Minimum content (placeholders — you fill the real values on the server; for the **first launch** keep `PAYMENTS_PROVIDER=none`):

```
NEXT_PUBLIC_APP_MODE=production
DATA_PROVIDER=prisma
APP_URL=https://example.com
DATABASE_URL=…            AUTH_SECRET=…
S3_BUCKET=…  S3_REGION=…  S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…  S3_ENDPOINT=…  S3_FORCE_PATH_STYLE=1
SMTP_HOST=…  SMTP_PORT=587  SMTP_USER=…  SMTP_PASSWORD=…  EMAIL_FROM="ACCA USA <no-reply@example.com>"
PAYMENTS_PROVIDER=none
LEGAL_OPERATOR_NAME=…  LEGAL_CONTACT_EMAIL=…  LEGAL_DATA_LOCATION=…
MEDIA_INLINE_PROCESSING=0
ANTIVIRUS_PROVIDER=clamav
CLAMAV_HOST=127.0.0.1  CLAMAV_PORT=3310
```

Build with the same environment (the mode is compiled in) and prepare the database. Variables are loaded only inside the `acca` user's
command, never into your own shell. **Run migrations only against the database you mean to change.**

```bash
run_acca() { sudo -u acca bash -c "set -a; . /etc/acca-usa/acca-usa.env; set +a; cd /srv/acca-usa && $*"; }
run_acca npm run build
run_acca npx prisma migrate deploy      # applies the committed migrations (docs/MIGRATIONS.md); never `migrate dev`, never `db push`
run_acca npm run db:bootstrap           # ACCA + FIA platforms and levels only; NO demo data; idempotent
```

**Preflight — run it now and after every change.** One command checks the configuration (names only), PostgreSQL and migrations, the bucket (writes and deletes one tiny object),
the SMTP login (sends nothing), FFmpeg with libx264/AAC, ClamAV, free disk, and — with `--url https://your-domain` — the public site's HTTPS/headers and that ports 3000, 5432, 9000 and 3310 are **closed** to the internet:

```bash
sudo -u acca bash -c 'set -a; . /etc/acca-usa/acca-usa.env; set +a; cd /srv/acca-usa && npm run preflight -- --url https://YOUR.DOMAIN'
```

Every line is `ok`, `WARN` or `FAIL` and it exits 1 on any FAIL; fix FAILs before starting students on the site. (Checked here against a local PostgreSQL, an S3 stand-in, an SMTP sink, FFmpeg and a clamd — and shown to fail correctly when each one is broken; not run on a real server.)

**There is no automatic seeding in production**: `npm run db:seed` is demo data and must never be run on production (the app also refuses the demo provider there).

Starting the service in step 8 validates the configuration; if anything is missing or unsafe the process exits and the journal names the variables (never their values).

First administrator (interactive password, never in argv or a file):

```bash
sudo -u acca bash -c 'set -a; . /etc/acca-usa/acca-usa.env; set +a; cd /srv/acca-usa
  read -rsp "Admin password: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
  ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npm run admin:create'
```

The administrator must enrol two-step verification (authenticator app) at the first sign-in; save the recovery information as instructed on screen.

## 8. systemd services

```bash
sudo cp /srv/acca-usa/deploy/systemd/acca-usa-web.service /srv/acca-usa/deploy/systemd/acca-usa-media-worker.service /etc/systemd/system/
sudo chmod +x /srv/acca-usa/deploy/backup/backup.sh
sudo systemctl daemon-reload
sudo systemctl enable --now acca-usa-web acca-usa-media-worker
systemctl status acca-usa-web acca-usa-media-worker --no-pager
journalctl -u acca-usa-web -n 50 --no-pager        # a refusal to start lists the wrong variable NAMES
journalctl -u acca-usa-media-worker -n 20 --no-pager
curl -s http://127.0.0.1:3000/api/health               # {"ok":true}
curl -s "http://127.0.0.1:3000/api/health?ready=1"     # {"ok":true} when PostgreSQL answers; 503 {"ok":false} otherwise
```

* Both services start at boot and restart on failure. `systemctl stop acca-usa-media-worker` stops FFmpeg, puts the file in flight back in the queue (`UPLOADED`) and exits cleanly.
* The web unit binds `127.0.0.1:3000`. Do not change that: Nginx sets the client IP header the application trusts for rate limits and audit entries.
* The unit files use `/usr/bin/node`; if `which node` differs, edit `ExecStart`.
* Logs are JSON lines in journald (`journalctl -u acca-usa-web -f`). They contain event codes, never passwords, tokens or file contents. journald keeps them according to `/etc/systemd/journald.conf` (`SystemMaxUse=`) — set a cap.

## 9. Nginx and HTTPS (Let's Encrypt)

```bash
sudo cp /srv/acca-usa/deploy/nginx/acca-usa.conf /etc/nginx/sites-available/acca-usa.conf
sudo sed -i 's/example\.com/YOUR.DOMAIN/g' /etc/nginx/sites-available/acca-usa.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/acca-usa.conf /etc/nginx/sites-enabled/acca-usa.conf
```

The file contains the HTTPS block, which needs certificate files that do not exist yet. Get the certificate first:

1. Temporarily comment out the whole `server { listen 443 … }` block, `sudo nginx -t && sudo systemctl reload nginx`.
2. `sudo certbot --nginx -d YOUR.DOMAIN -d www.YOUR.DOMAIN` (DNS must already point here; ports 80/443 open).
3. Restore the 443 block (certbot may have rewritten parts — keep its `ssl_certificate*` paths), `sudo nginx -t && sudo systemctl reload nginx`.
4. Renewal is automatic: `systemctl list-timers | grep certbot` and `sudo certbot renew --dry-run`.

What the config does for uploads: `client_max_body_size 170m` (the app's absolute limit is 160 MB; the real per-type limits — 150 MB video, 80 MB audio,
40 MB slides, 25 MB PDF/file, 5 MB image — are enforced by the application on the byte stream), `proxy_request_buffering off` (the body streams to the app instead of being
written to Nginx's temp directory first), long body/read timeouts for slow connections, and an **overwritten** `X-Forwarded-For`.

Test from outside: `curl -I https://YOUR.DOMAIN/api/health`, sign in as the administrator, upload a small PDF, then a short video; the video becomes visible to students only after
its status turns READY (Admin → Materials).

### Optional: let Nginx serve the video (recommended once students are many)

By default video bytes pass through the Node app. With `FILE_DELIVERY=nginx` (and `S3_FORCE_PATH_STYLE=1`, MinIO on `127.0.0.1:9000`) the app only checks access and
answers `X-Accel-Redirect`; Nginx then streams from the private bucket using a 60-second signed URL that never reaches the browser (`location /_s3/` in `deploy/nginx/acca-usa.conf`,
`internal` = not reachable directly). Change `127.0.0.1:9000` in that block if your `S3_ENDPOINT` differs. **Never set it without that Nginx block** (the response would be empty).
Tested here with a real Nginx 1.24 and an S3 stand-in: Range requests, headers, view-only rules (students still get 403 for `?download`), anonymous 401 and the 404 of the internal path;
**not** tested with MinIO. Also raise `worker_connections 4096;` and `worker_rlimit_nofile 8192;` in `/etc/nginx/nginx.conf`. Measurements: `docs/LOAD_AND_CAPACITY.md`.

## 10. Test the upload path on the real server (do not skip)

On **staging** first, with your real Nginx and storage:

1. A 5 MB PDF, a 100 MB video and an 80 MB audio file upload without error; the video turns READY (`journalctl -u acca-usa-media-worker -f`).
2. A file just over the limit (e.g. a 26 MB PDF) is refused with the "too large" message — and nothing remains in the bucket.
3. A text file renamed to `.mp4` is refused ("signature").
4. Seek inside the video (Range requests) as a student; download a PDF through the viewer.
5. While a conversion runs, `sudo systemctl restart acca-usa-media-worker`: the file returns to the queue and finishes after the restart.
6. `df -h` before and after: no space is left behind in `/var/lib/acca-media` or Nginx's `/var/lib/nginx`.
7. Disconnect your network in the middle of a big upload: no partial file appears in the library.

Then run, from your own computer against the **staging** URL: `BASE=https://staging.example.com node scripts/security-probe.mjs` (48 black-box security probes; with test-account cookies it also runs the
authenticated checks) and `scripts/registration-probe.mjs` (sign-up edge cases; needs Chromium: `BASE=… CHROMIUM=/path/to/chromium node …`). Both must end with "passed". Never run them against the production site.

## 11. Updating to a new version

```bash
cd /srv/acca-usa && sudo -u acca git fetch && sudo -u acca git checkout <new tag/branch>
sudo -u acca npm ci
run_acca "npm run build && npx prisma migrate deploy"   # run_acca is defined in step 7
sudo systemctl restart acca-usa-web acca-usa-media-worker
curl -s "http://127.0.0.1:3000/api/health?ready=1"
```

Take a database backup (`sudo systemctl start acca-usa-backup`) **before** migrations. Migrations are additive and forward-only (`docs/MIGRATIONS.md`);
to roll back the code, check out the previous tag — a database rollback means a restore (`docs/BACKUP_AND_RESTORE.md`).

## 12. Backups and the off-server copy

See `docs/BACKUP_AND_RESTORE.md`. In short: `/etc/acca-usa/backup.env` (mode 0640 root:acca) with `BACKUP_DIR=/var/backups/acca-usa` and `BACKUP_PASSPHRASE=…`
(kept **also** in your password manager), optional `BACKUP_REMOTE` / `FILES_*` rclone targets, then
`sudo cp deploy/systemd/acca-usa-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now acca-usa-backup.timer`.

## 12b. Monitoring and alerts

```bash
sudo cp /srv/acca-usa/deploy/systemd/acca-usa-monitor.* /etc/systemd/system/
sudo cp /srv/acca-usa/deploy/monitoring/monitor.env.example /etc/acca-usa/monitor.env     # edit: your domain, backup dir, Telegram bot (optional)
sudo chown root:acca /etc/acca-usa/monitor.env && sudo chmod 640 /etc/acca-usa/monitor.env
sudo chmod +x /srv/acca-usa/deploy/monitoring/monitor.sh
sudo mkdir -p /etc/systemd/journald.conf.d && sudo cp /srv/acca-usa/deploy/journald/acca-usa.conf /etc/systemd/journald.conf.d/ && sudo systemctl restart systemd-journald
sudo systemctl daemon-reload && sudo systemctl enable --now acca-usa-monitor.timer
sudo systemctl start acca-usa-monitor && journalctl -t acca-monitor -n 5 --no-pager      # nothing is printed while everything is fine
```

Every 5 minutes it checks: site + database (`/api/health?ready=1`), disk usage (alerts at 85 %), TLS certificate (alerts 14 days before expiry), age of the newest database backup (alerts after 30 h), ClamAV, and the web / worker services.
You get **one message when something breaks, a reminder every 6 hours while it lasts, and one when it recovers** (journal + Telegram / webhook if configured). The logic was tested here with a stand-in site and webhook (alert, no repeat, recovery); Telegram delivery and `systemctl` checks were **not** (no systemd in the sandbox). Journald is capped at 1 GB / 30 days by the drop-in.
Also add an **external** uptime check (a free monitoring service pinging `https://YOUR.DOMAIN/api/health`): the monitor cannot tell you that the whole server is down.

## 13. Routine operations

| Task | Command |
|---|---|
| Service state | `systemctl status acca-usa-web acca-usa-media-worker` |
| Live logs | `journalctl -u acca-usa-web -f` · `journalctl -u acca-usa-media-worker -f` |
| Files stuck / failed | Admin → Materials shows the status and reason code; fix the cause (e.g. free disk space), press *Retry processing* or wait for the worker |
| Disk | `df -h /` and the MinIO data directory; alert at 80 % |
| Certificates | `sudo certbot renew --dry-run` |
| Security updates | `unattended-upgrades` (step 2); reboot when the kernel changes |
| Lost admin MFA device | `npm run admin:mfa-reset` (operator CLI, audited) |

## 14. Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| `acca-usa-web` exits at once | Missing/invalid variable — the journal names it (never the value). Fix `/etc/acca-usa/acca-usa.env`, `systemctl restart`. |
| `502 Bad Gateway` | The web service is down: `systemctl status acca-usa-web`. |
| `413 Request Entity Too Large` from Nginx (HTML page) | `client_max_body_size` too small or the config was not reloaded. The app's own refusals are JSON `{"code":"SIZE"}`. |
| Upload hangs/times out for big files | `client_body_timeout`, `proxy_send_timeout`; slow uplink of the uploader. |
| Video stays `UPLOADED`/`FAILED: FFMPEG_NOT_AVAILABLE` | `ffmpeg`/`ffprobe` missing for the *worker's* user/PATH; install or set `FFMPEG_PATH`. |
| `FAILED: NO_DISK_SPACE` | Free space under `MEDIA_TMP_DIR`, then *Retry processing*. |
| `FAILED: STORAGE_ERROR` | The bucket/endpoint/keys; check `S3_*` and that MinIO runs. Retried automatically (3 attempts), then use *Retry processing*. |
| Everyone is logged out after a restart | `AUTH_SECRET` changed or missing. Do not rotate it casually (`docs/AUDIT.md`). |
| Wrong client IP in rate limits | The app is reachable without Nginx (check it binds 127.0.0.1) or Nginx does not overwrite `X-Forwarded-For`. |
