# Database migrations — production strategy

Migrations live in `prisma/migrations` and are applied with `prisma migrate deploy` (never `migrate dev` / `migrate reset` on a
shared or production database). Current history:

| Migration | Change | Risk |
| --- | --- | --- |
| `…_init` | creates the whole schema | none (empty database) |
| `…_platform_price` | `ALTER TABLE "Platform" ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0` | additive, constant default → no table rewrite on PostgreSQL 11+ |
| `…_payment_checkout_url` | `ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT` | additive, nullable |

No migration so far drops, renames or rewrites data.

## Rules

1. **Additive first.** New columns are nullable or have a constant default; new tables / indexes are fine. Large-table indexes
   are created `CONCURRENTLY` by hand-editing the generated SQL (and the migration is then marked as not running in a transaction).
2. **Never destructive in one release.** Dropping or renaming a column / table / enum value is a **two-step release**:
   release N stops reading and writing it (and ships a backfill if data moves); release N+1 drops it after N has been stable.
   Same for tightening constraints (`NOT NULL`, new `UNIQUE`): first backfill and verify no violations, then add the constraint.
3. **Review the SQL** of every generated migration before committing; Prisma generates `DROP` + `ADD` for renames — rewrite as `RENAME`.
4. **Records of fact are never deleted by migrations:** `Payment`, `PaymentEvent`, `Certificate`, `TestAttempt` (foreign keys are
   `RESTRICT`; certificates keep snapshots).
5. A migration that has been applied anywhere is **never edited**; fix forward with a new one.

## Deploy procedure

```bash
# 1. backup (see below), 2. maintenance window only if the migration takes locks you have measured
npx prisma migrate status         # must show nothing pending / no drift
npx prisma migrate deploy         # applies pending migrations in order, each in a transaction
# 3. start the new build; 4. smoke: login, a page per area, /api/webhooks/payments answers 400 unsigned
```

Run migrations from the release pipeline, once, before new instances start (not at application start-up, so concurrent
instances never race). The application tolerates the *previous* schema for one release because changes are additive.

## Backup recommendation

Tooling and the verified restore procedure: **docs/BACKUP_RESTORE.md** (`npm run db:backup`, `npm run db:restore`).

* Before every production migration: a logical dump (`pg_dump --format=custom`) **and** a verified restore of the latest
  automated snapshot / PITR point (managed PostgreSQL: enable point-in-time recovery, ≥ 7 days).
* Test the restore on a scratch database at least once per quarter; an untested backup is not a backup.
* Object storage (uploads) is separate: enable bucket versioning; the database only holds metadata (`StoredFile`).

## Rollback

* **Additive migration** (all current ones): roll the application back to the previous build; leave the new column in place —
  old code ignores it. No data loss.
* **Failed migration:** each migration runs in a transaction; PostgreSQL rolls it back. Fix the SQL, ship a new migration.
  If `_prisma_migrations` is left marked failed, resolve with `prisma migrate resolve --rolled-back <name>` after inspecting.
* **Destructive change shipped by mistake** (should not happen under rule 2): restore from the pre-migration backup into a new
  instance, copy the affected rows back; payments / certificates are reconstructable from the provider's records and the
  certificate numbers (`AU-<year>-<n>`).

## Production vs development data

`prisma/seed.ts` and `prisma/reset-dev.ts` refuse to run in production or against a non-local host. Production gets structure
through `npm run db:bootstrap` (ACCA / FIA platforms and levels; idempotent, no demo rows) and the first administrator through
`npm run admin:create`.

## Checklist for a new migration

- [ ] additive (or the second half of a two-step release)
- [ ] SQL reviewed, locks considered, indexes on big tables concurrent
- [ ] backfill script / default provided where needed
- [ ] `prisma migrate deploy` tested on a copy of production-shaped data
- [ ] backup taken, rollback described in the PR
