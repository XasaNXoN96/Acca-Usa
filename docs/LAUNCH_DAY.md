# Launch day: from "I bought the server" to "students can sign up"

A runbook for the first deployment, in the order that works. Total time: **one day for staging, one day for production** if nothing surprising happens. Read `docs/VPS_DEPLOYMENT.md` for the commands behind every step; this page is the plan and the gates.
Rule of the day: **a gate that does not pass stops the day.** Nothing is "fixed later" while students wait.

## Before the day (you, no server needed)
| Item | Done when |
|---|---|
| VPS bought: 2 vCPU / 8 GB / 80 GB NVMe, Ubuntu 24.04, **guaranteed uplink ≥ 250 Mbit/s** and no tight traffic cap (ask the provider in writing) | you have the IP and root/SSH access |
| Domain bought, DNS `A` record (and `www`) points to the IP | `ping your-domain` shows the IP |
| E-mail sending (SMTP): provider account, sender domain with SPF + DKIM + DMARC | you have host, port, user, password (kept in your password manager) |
| Payme: merchant registered, cashbox created, **test key** and production key, endpoint URL entered in the cabinet | you have merchant id + keys (see `docs/PAYMENTS.md`); without Payme start with `PAYMENTS_PROVIDER=none` |
| Legal: operator name, address, tax id, contact e-mail, where data is stored; **a lawyer has read the texts** | `LEGAL_*` values ready; `LEGAL_TEXTS_REVIEWED=1` only after the lawyer |
| First content: a few subjects / topics / materials / questions (CSV) ready for the staging rehearsal | the administrator has practised with `docs/ADMIN_GUIDE_RU.md` |
| Telegram: the bot created with @BotFather (token kept in your password manager), you pressed Start in it | `docs/TELEGRAM.md` §1 done |
| Off-server backup place (second provider / bucket) | an account exists |

## Day 1 — staging (a sub-domain such as `staging.your-domain`, own database, own secrets, own bucket)
1. **Server basics** — `VPS_DEPLOYMENT.md` §2–§4: SSH key only, firewall (22/80/443), updates, packages, user `acca`. *Gate: you can log in as `deploy` with the key; `ufw status` shows only 22/80/443.*
2. **PostgreSQL, MinIO (or provider storage), ClamAV** — §5, §6, `ANTIVIRUS.md`. *Gate: `psql` login works; bucket is private; `echo PING | nc 127.0.0.1 3310` → PONG.*
3. **Code, environment file, build, migrations, bootstrap, first administrator** — §7. *Gate: `npm run build` and `npx prisma migrate deploy` finish without errors.*
4. **`npm run preflight -- --url https://staging.your-domain`** — *Gate: 0 FAILED. Every WARN is understood.*
4b. **Telegram:** put the five variables in the env file, `npm run telegram:setup`, press Start in the bot → chat id → run again; Admin → Security → **Connect Telegram**. *Gate: the test message arrives; you can sign in with the Telegram code AND with the authenticator.*
5. **systemd services, Nginx, HTTPS** — §8, §9. *Gate: `https://staging…/api/health?ready=1` → `{"ok":true}`; `nginx -t` OK; ports 3000/5432/9000/3310 closed from outside (preflight checks this).*
6. **Rehearsal as a real user:** register a student (e-mail arrives, confirm it), the administrator (with two-step code) uploads a PDF, a short video and 100 MB video, imports 20 questions from CSV, sets a price in sum, grants access by hand, the student opens the video on a phone. *Gate: all work; the big video turns READY.*
7. **Payments rehearsal (Payme test environment):** `PAYME_CHECKOUT_URL=https://test.paycom.uz` + test key; a test purchase end to end; a cancellation; then **Payme's own certification checks** against `https://staging…/api/payments/payme`. *Gate: Payme confirms the checks. If Payme asks for changes, they go into `src/services/payments/payme-rpc.ts` and are re-tested with `npm run test:payme` before anything else.*
8. **Probes from your own computer:** `scripts/security-probe.mjs`, `scripts/registration-probe.mjs`, then `scripts/load-test.mjs` (`docs/LOAD_AND_CAPACITY.md`). *Gate: probes pass; you write down the load ceiling.*
9. **Backups:** start `acca-usa-backup.timer`, run it once by hand, **restore the dump into a scratch database** (`BACKUP_AND_RESTORE.md`), check the file copy. *Gate: the restore ends with "verified".*
10. **Monitoring:** §12b; stop the web service on purpose and confirm the alert arrives; start it again and confirm the recovery message.

## Day 2 — production (the real domain, new secrets, new database, new bucket — nothing copied from staging)
1. Repeat 1–5 with the production domain. **New** `AUTH_SECRET`, new database password, new bucket and keys. Production Payme key and `https://checkout.paycom.uz` only after step 3 below.
2. `PRICE_CURRENCY=UZS`, `ANTIVIRUS_PROVIDER=clamav`, `FILE_DELIVERY=nginx` if you chose the offload, `SEO_INDEX=1` **only at the moment you want search engines to see the site**.
3. `npm run preflight -- --url https://your-domain` — 0 FAILED. Create the first administrator (`npm run admin:create`), enrol two-step verification, store the recovery codes offline.
4. Put the real platforms' prices in *Admin → Platforms*, load the real content, publish.
5. One **real** purchase with a real card (small amount, your own card), check access, then refund it through Payme and check the access is withdrawn.
6. Backups running, monitoring running, external uptime check added, `docs/PRODUCTION_CHECKLIST.md` fully ticked.
7. Announce. Keep the console open for the first hour: `journalctl -u acca-usa-web -f`.

## If something goes wrong
| Problem | First move |
|---|---|
| Site down | `systemctl status acca-usa-web` → `journalctl -u acca-usa-web -n 100`; a refusal to start lists the wrong variable **names** |
| Payments not arriving | Payme cabinet → transactions; `journalctl -u acca-usa-web | grep payme`; the endpoint must be public and not behind a login or an IP filter |
| Students can't confirm e-mail | check SMTP (`preflight`), spam folder, SPF/DKIM; the administrator can grant access by hand meanwhile |
| Uploads fail | `docs/VPS_DEPLOYMENT.md` §14 table; `df -h`; the worker log |
| Need to roll back | previous Git tag + `systemctl restart`; a database rollback is a restore (take a backup **before** every update) |
