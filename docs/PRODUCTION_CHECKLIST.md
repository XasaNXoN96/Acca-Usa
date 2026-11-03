# Production checklist

Self-hosted VPS: do `docs/VPS_DEPLOYMENT.md` first; this list is the final gate. Status of each item today: `docs/DEPLOYMENT_STATUS.md`.

Tick every line before the first real user. "Verified here" means an automated check in this repository covers it;
everything else needs a human against the real service.

## Configuration (`docs/DEPLOYMENT_MODES.md`)
- [ ] `NEXT_PUBLIC_APP_MODE=production` at build **and** run time; `DATA_PROVIDER=prisma`
- [ ] `AUTH_SECRET` ≥ 32 random characters, stored in the platform's secret manager (never in git)
- [ ] `APP_URL` is the public `https://` URL
- [ ] `DATABASE_URL`, S3 and SMTP and payment variables set; the server starts (it refuses otherwise) — *verified here: `test:production`, `test:env`*

## VPS and network (`docs/VPS_DEPLOYMENT.md`)
- [ ] SSH key login only, root login and passwords disabled, second session tested before closing the first; `ufw` allows only 22/80/443; `fail2ban` and `unattended-upgrades` on
- [ ] PostgreSQL listens on localhost only; dedicated role/database; separate database for staging; `psql … -c "SELECT 1"` works
- [ ] app bound to `127.0.0.1:3000`; Nginx in front with HTTPS (Let's Encrypt), `certbot renew --dry-run` passes, HTTP redirects to HTTPS
- [ ] `/etc/acca-usa/*.env` owned `root:acca`, mode 0640; no secret in Git, unit files, shell history, logs
- [ ] `systemctl enable` for web + worker (+ backup timer); reboot test: everything returns by itself; `/api/health?ready=1` is `{"ok":true}`
- [ ] `PAYMENTS_PROVIDER` chosen on purpose (`none` for the first launch); journald size cap set
- [ ] **upload drill on the real server** (VPS_DEPLOYMENT.md §10): big video, oversize file, spoofed file, seek, worker restart mid-conversion, dropped connection — **not verified here (no VPS)**
- [ ] off-server copies of DB dumps **and** files exist; a DB restore drill and a file restore drill were done — **not verified here**

## Security checks on the real server
- [ ] `ANTIVIRUS_PROVIDER=clamav`; `freshclam` has downloaded signatures; `echo PING | nc 127.0.0.1 3310` → PONG; upload the EICAR test string in a `.txt` as admin → the file is **rejected** (`docs/ANTIVIRUS.md`) — **not verified here (no real signature database)**
- [ ] `node scripts/security-probe.mjs` and `scripts/registration-probe.mjs` against **staging** end with "passed"
- [ ] `nginx -t` OK, HTTPS grade checked (e.g. SSL Labs), `curl -I` shows HSTS / nosniff / no `X-Powered-By`, port 3000 / 5432 / 9000 / 3310 are **not** reachable from outside (`nmap` from another machine)
- [ ] `docs/LOAD_AND_CAPACITY.md`: load test run on staging from another machine; ceiling written down

## Payments, currency, sign-up (December scope)
- [ ] `PRICE_CURRENCY=UZS`; prices typed in whole sum in Admin → Platforms; a student sees "UZS 150,000" in all three languages
- [ ] Payme: merchant id + cashbox key typed **on the server**; endpoint registered in the Payme cabinet (`/api/payments/payme`, account field `order_id`); test purchase + cancellation on `test.paycom.uz`; **Payme's certification checks passed** — *not verified here (no Payme account)*
- [ ] one real purchase and one refund with your own card; access appears after the purchase and disappears after the refund
- [ ] e-mail confirmation: a new account receives the link, the banner disappears after confirming, buying is refused before — *verified here against a mail sink; real mailbox delivery (spam / SPF / DKIM) not verified*
- [ ] question import: a 20-row CSV imported as drafts, reviewed, published (`docs/ADMIN_GUIDE_RU.md`)
- [ ] `npm run preflight -- --url https://your-domain` → 0 FAILED; monitoring timer running and an alert was seen once on purpose (`docs/VPS_DEPLOYMENT.md` §12b)
- [ ] `SEO_INDEX=1` set only when you want the public pages found by search engines

## Telegram (`docs/TELEGRAM.md`)
- [ ] bot created, the five variables set, `npm run telegram:setup` ended with "test message sent", `npm run preflight` shows the bot OK — *real Telegram not tested here*
- [ ] every administrator connected Telegram (Admin → Security) **and** still has the authenticator app; both ways of signing in tried once; Telegram's own Two-Step Verification is on
- [ ] a test registration, a support-form message and a direct message to the bot all arrived in the chat; the monitor alert arrived once on purpose
- [ ] `TELEGRAM_PII` chosen on purpose; the privacy policy mentions Telegram if your lawyer says so

## Database (`docs/MIGRATIONS.md`)
- [ ] automated backups (`npm run db:backup`, encrypted, copied to write-once storage) + point-in-time recovery enabled; **restore drill done** with `npm run db:restore` on YOUR infrastructure (`docs/BACKUP_AND_RESTORE.md`) — tools proven only on local PostgreSQL 16
- [ ] object-storage versioning / replication for uploaded files (not covered by the database backup); `AUTH_SECRET` / `AUDIT_CHAIN_SECRET` stored in a secret manager
- [ ] `prisma migrate deploy` run from the pipeline; `npm run db:bootstrap`; `npm run admin:create` (strong password)
- [ ] connection pool sized for the number of instances (PgBouncer / Prisma Accelerate if serverless)

## Storage (`docs/STORAGE.md`)
- [ ] bucket private, public access blocked, versioning on; credentials limited to Get/Put/Delete on that bucket
- [ ] one real upload + download + Range seek tried in staging — **not verified here (no real bucket)**
- [ ] a scheduled job calls `collectGarbage()` for abandoned uploads

## E-mail (`docs/EMAIL.md`)
- [ ] SPF, DKIM, DMARC for the sender domain; a real welcome and reset mail received in all three languages — **not verified here**

## Payments (`docs/PAYMENTS.md`)
- [ ] Stripe live keys; webhook endpoint `/api/webhooks/payments` registered with the listed events
- [ ] test-mode purchase end to end: pending → paid → access, failed card, refund — **not verified here (no Stripe)**
- [ ] prices set in Admin → Platforms (0 = free)

## Content
- [ ] subjects, topics, materials, question bank, tests created and published; sample certificate downloaded and verified via QR
- [ ] legal pages / privacy / terms / refund policy added to the footer (not part of this codebase)

## Operations
- [ ] logs shipped (structured JSON on stderr: `payment.*`, `email.*` events); alerts on `payment.webhook_failed`, `payment.amount_mismatch`
- [ ] uptime check on `/` and a synthetic login
- [ ] periodic cleanup of expired `RateLimit` / `ResetToken` rows
- [ ] dependency updates scheduled (`docs/SECURITY_AUDIT.md` lists the known advisory)

## Quality gates (this repository)
`npm run check` · `npm run build` · `npm run smoke:all` · `npm run smoke:db` · `npm run test:integration` ·
`npm run build:prod-test && npm run test:production`
