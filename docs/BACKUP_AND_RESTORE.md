# Backup and restore (PostgreSQL + uploaded files)

Status: **tools implemented; restore proven end-to-end on a local PostgreSQL 16 (`npm run test:backup`, 9 checks).** Not verified: a managed PostgreSQL service (RDS, Supabase, Neon, …), very large databases, point-in-time recovery, object-storage backups, an actual production backup schedule. An untested backup is not a backup — run the drill below on **your** infrastructure before relying on it.

## What is covered

| | |
|---|---|
| Covered | the whole PostgreSQL database: users, enrolments, payments ledger, content, notes, results, certificates, audit log (incl. its protection triggers), migration history |
| **Not covered** | uploaded files (materials, images, subtitles) — they live in object storage (S3 compatible) and need that provider's versioning / cross-region replication / lifecycle rules; secrets (`AUTH_SECRET`, `AUDIT_CHAIN_SECRET`, Stripe / SMTP keys — keep them in your secret manager, **without `AUTH_SECRET` the encrypted MFA secrets in a restored database are unreadable**); in-flight e-mail |

## Backup

```bash
DATABASE_URL=postgresql://… BACKUP_DIR=/secure/backups \
BACKUP_PASSPHRASE='<≥16 chars, kept in your secret manager>' \   # strongly recommended: backups contain personal data
AUTH_SECRET=… \                                                  # optional: records a "backup.created" audit event
BACKUP_KEEP=14 \                                                 # optional retention (own files only); unset = never delete
npm run db:backup
```

* `pg_dump --format=custom` (consistent snapshot, does not block writers), credentials passed through libpq environment variables, never argv.
* Writes `acca-<UTC time>.dump[.enc]` (mode 0600) and `….manifest.json`: SHA-256 of the file, applied migrations, row counts per table, audit event count and chain head. The manifest holds no secrets and no personal data.
* With `BACKUP_PASSPHRASE` the dump is encrypted (AES-256-GCM, scrypt-derived key); a wrong passphrase or any modification fails authentication.
* The tool says **"Not restore-tested yet"** on purpose — that is a separate step.
* Needs `pg_dump` / `pg_restore` of a major version ≥ the server's on the machine that runs it. Scheduling is yours (cron, systemd timer, CI job, your platform's scheduler) — none is shipped, none is claimed.

Copy dumps and manifests to storage the application and the database administrator cannot silently overwrite (write-once / versioned bucket, separate account).

## Restore (and verification)

```bash
createdb -h … acca_restore_check          # a NEW, EMPTY database
BACKUP_FILE=/secure/backups/acca-….dump.enc \
RESTORE_TARGET_URL=postgresql://…/acca_restore_check \
BACKUP_PASSPHRASE=… AUTH_SECRET=… \       # AUTH_SECRET (or AUDIT_CHAIN_SECRET) enables the audit-chain check
npm run db:restore
```

The tool has **no overwrite, drop or clean mode**. Safety is structural, not a flag:

1. the backup is used only if its SHA-256 equals the manifest (and, if encrypted, authenticates);
2. the target must exist and contain **no tables at all**, and must not be the `DATABASE_URL` database → a live or production database can never be restored over;
3. `pg_restore --single-transaction --exit-on-error`: all or nothing — a failed restore leaves the target empty;
4. then it verifies the restored database: every manifest table present, no table with more rows than the manifest knows, applied migrations equal to the manifest, no migration unknown to this code (older app version) and a notice for migrations newer than the backup, audit protection triggers present, referential sample, **audit hash chain** (reported `NOT VERIFIED` if no key is provided — never silently OK).

Exit codes: `0` restored and verified · `1` usage · `3` backup rejected (checksum / manifest / passphrase) · `4` target not empty or is the live database · `5` verification failed · `6` restore failed (rolled back).

### Recovering production

1. Stop writes (maintenance mode / scale the app to zero) if the live data is damaged.
2. Restore the chosen backup into a **new** database on the same server (or a new server) with the command above; read the verification output.
3. If the backup is older than the code: `DATABASE_URL=<restored> npx prisma migrate deploy`.
4. Run `AUTH_SECRET=… DATABASE_URL=<restored> npm run audit:verify` and your own acceptance checks (admin sign-in with MFA, a student's courses, payments list).
5. Switch the application's `DATABASE_URL` to the restored database. Keep the damaged database for forensics; do not drop it until the incident is closed.
6. Payments after the backup point: reconcile with the Stripe dashboard / webhook event log (events not in the restored ledger can be re-delivered by Stripe; they are idempotent).

### Restore drill (do this before launch and quarterly)

Take a fresh production backup → restore into a scratch database → `npm run db:restore` must end with "verified" → start the app against it (`DATABASE_URL=<scratch>`, staging `AUTH_SECRET`) and sign in → record the date, backup name, duration and result in your runbook.

## Self-hosted VPS: what is automated, what is not

| Part | Tool | Status |
|---|---|---|
| PostgreSQL dump, encrypted, with manifest + SHA-256 | `npm run db:backup` (run nightly by `deploy/systemd/acca-usa-backup.timer` → `deploy/backup/backup.sh`) | tool tested locally on PostgreSQL 16 (`npm run test:backup`); the timer/unit files are **not run on a real systemd** |
| Restore into a new empty DB + verification | `npm run db:restore` | tested locally (same suite) |
| **Off-server copy of the dumps** | `BACKUP_REMOTE` (rclone `copy`, never deletes remotely) in `backup.sh` | script logic tested with a **stub** `rclone`; real rclone/remote **not tested** |
| **Uploaded files (bucket)** | `FILES_SOURCE_REMOTE` → `FILES_REPLICA_REMOTE` (rclone `copy` into a second bucket) + provider versioning | script logic tested with a stub only; **no real bucket/MinIO backup has been run**. If you configure neither, the job logs `files_not_configured` — your files then have **no backup at all** |
| Integrity of dumps | SHA-256 manifest checked at restore time | tested locally |
| Integrity of file copies | run the "keys in DB exist in bucket" check in `docs/FILES_BACKUP.md` after every restore | procedure only |

Rules: keep `BACKUP_PASSPHRASE` and `AUTH_SECRET` **outside** the server too (password manager) — without them encrypted dumps and MFA secrets are unreadable. Copies go to a different provider/account than the VPS.
`/etc/acca-usa/backup.env` (root:acca, 0640) holds `BACKUP_DIR=/var/backups/acca-usa`, `BACKUP_PASSPHRASE`, optional `BACKUP_KEEP`, `BACKUP_REMOTE`, `FILES_*`.

### Disaster order (server lost)

1. New VPS: steps 2–5 of `docs/VPS_DEPLOYMENT.md` (hardening, software, PostgreSQL, storage).
2. Restore the **file bucket** first from the replica / versioned bucket (or leave it if the provider-hosted bucket survived).
3. Create an empty database, fetch the newest dump + manifest from the off-server copy, `npm run db:restore` into it; read the verification output.
4. Put the original `AUTH_SECRET` (and `AUDIT_CHAIN_SECRET` if used) into the new env file; `prisma migrate deploy` if the code is newer than the dump.
5. Run the file check from `docs/FILES_BACKUP.md` (every `MISSING` key = a material to recover), `npm run audit:verify`.
6. Start `acca-usa-web` and `acca-usa-media-worker`, sign in as an administrator (MFA), spot-check a student and a video; then repoint DNS.
7. Files in `UPLOADED`/`FAILED` status are picked up by the worker again; derived renditions can be regenerated, originals cannot.

### Drills to schedule (not yet performed by anyone)

DB restore drill (quarterly) · file restore drill (quarterly) · "VPS gone" full rehearsal on a scratch server before launch.

## What `npm run test:backup` proves (local PostgreSQL 16, seeded demo data)

backup + manifest + checksum + private file mode · restore brings back the state **at backup time** (rows deleted/added afterwards are not there) with identical row counts, working password hashes, audit triggers and sequence · refusal to restore into a non-empty or the live database (live data unchanged) · corrupted dump and missing manifest rejected before touching the target · truncated dump with a forged checksum rolls back (target stays empty) · encrypted backup: no plaintext, correct passphrase restores, wrong passphrase / tampering rejected · a backup whose audit log was rewritten fails verification (exit 5) · missing key reported as NOT VERIFIED · retention keeps N own files and nothing else.

## Limits

* Logical dumps: restore time grows with data size and was not measured on production-size data. For a tight RPO/RTO use managed PITR **in addition** (WAL archiving / provider snapshots) — not configured here.
* The manifest's row counts are taken right after the dump; on a busy database they can be slightly higher than the dump (reported as a note, not an error).
* The passphrase and `AUTH_SECRET` are not recoverable from the backup. Losing the passphrase = losing that backup.
