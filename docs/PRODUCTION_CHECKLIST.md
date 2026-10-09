# Production checklist

Tick every line before the first real user. "Verified here" means an automated check in this repository covers it;
everything else needs a human against the real service.

## Configuration (`docs/DEPLOYMENT_MODES.md`)
- [ ] `NEXT_PUBLIC_APP_MODE=production` at build **and** run time; `DATA_PROVIDER=prisma`
- [ ] `AUTH_SECRET` ≥ 32 random characters, stored in the platform's secret manager (never in git)
- [ ] `APP_URL` is the public `https://` URL
- [ ] `DATABASE_URL`, S3 and SMTP and payment variables set; the server starts (it refuses otherwise) — *verified here: `test:production`, `test:env`*

## Database (`docs/MIGRATIONS.md`)
- [ ] automated backups (`npm run db:backup`, encrypted, copied to write-once storage) + point-in-time recovery enabled; **restore drill done** with `npm run db:restore` on YOUR infrastructure (`docs/BACKUP_RESTORE.md`) — tools proven only on local PostgreSQL 16
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
