# Database (PostgreSQL + Prisma)

Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations` (apply with `npm run db:migrate`, i.e. `prisma migrate deploy`).
Seed: `prisma/seed.ts` — **development / demo only**, refuses to run in production.

## Providers

`DATA_PROVIDER=memory|prisma` is read once in `src/services/index.ts`.

| Provider | Where it lives | Used for |
| --- | --- | --- |
| `memory` | `src/services/mock/*` | demo mode, resets on restart |
| `prisma` | `src/services/prisma/*` | production (required) and demo-on-PostgreSQL |

Both implement the same contracts (`src/services/contracts.ts`) and share the **pure** progress / unlocking rules in
`src/services/domain/calc.ts` (`CalcDb`). The Prisma provider builds a scoped `CalcDb` with `loadCalcDb(userIds | "all")`:
the small catalogue tables plus learning state for the requested users only. Everything else is a targeted, indexed query.

The whole smoke suite runs against both providers: `npm run smoke:all` (memory) and `npm run smoke:db` (PostgreSQL; the
runner empties and re-seeds a **local** development database before every suite — `prisma/reset-dev.ts` refuses any
non-local host or production mode).

## Local database

```bash
# any PostgreSQL 14+; example with a local server on 5432
export DATABASE_URL="postgresql://user:pass@localhost:5432/acca_usa?schema=public"
npm run db:migrate       # apply migrations
npm run db:seed          # demo / development data (never in production)
DATA_PROVIDER=prisma npm run dev
```

## Model overview

| Area | Tables |
| --- | --- |
| Identity | `User`, `ResetToken` (hashed, single use), `RateLimit` (shared limiter store) |
| Catalogue | `Platform` → `Level` → `Subject` → `Topic` → `Material`; `StoredFile` (production storage metadata) |
| Access | `Enrollment` (`FREE / ACTIVE / EXPIRED / REVOKED`, optional `expiresAt`, `paymentId`) |
| Learning state | `TopicProgress`, `MaterialProgress`, `LastMaterial`, `Activity` |
| Assessment | `Question`, `Test` (`kind = topic_test | exam`), `TestQuestion` (ordered), `TestAttempt` |
| Commerce | `Payment`, `PaymentEvent` (webhook idempotency) |
| Certificates | `Certificate` (snapshots), `CertificateCounter` (per-year sequence) |
| Engagement | `Notification` |

## Integrity rules

* **Keys.** Identifiers that appear in URLs are application-owned strings (`Platform.slug`, `Subject.slug`, `Topic.id`,
  `Test.id`, `Material.id`); everything else is `cuid()`.
* **Uniques.** `User.email`, `Enrollment(userId, platformSlug)`, `Level(platformSlug, order)`, `Certificate.number`,
  `Payment(provider, providerPaymentId)`, `Payment(userId, idempotencyKey)`, `PaymentEvent(provider, eventId)`,
  `StoredFile.storageKey`.
* **Foreign keys.** Catalogue and records of fact (`Payment`, `Certificate`, `TestAttempt`, `TestQuestion → Question`)
  use `RESTRICT`; per-user learning state (`TopicProgress`, `MaterialProgress`, `Notification`, …) `CASCADE`s with the user.
  `Material.fileId` / `Question.imageId` reference the storage object **by id only** (no FK) so each storage provider owns
  its own metadata.
* **Soft delete.** `deletedAt` on users, platforms, subjects, topics, materials, questions and tests. Student queries filter
  it, and archiving a parent hides children at read time (`visible*Where` in `prisma/catalog.ts`).
* **Timestamps.** `createdAt` everywhere, `updatedAt` on mutable rows.
* **Snapshots.** Certificates keep holder / subject names; submitted attempts keep a frozen `result` JSON (questions,
  answers, explanations), so later edits never rewrite history.
* **Concurrency.** Submit/expire is a conditional `IN_PROGRESS → SUBMITTED` update (exactly one winner); reset tokens are
  claimed with a conditional update; certificate numbers come from an atomic per-year counter; progress uses upserts.

## Indexes

Composite indexes follow the read paths: `Topic(subjectSlug, order)`, `Material(subjectSlug)`, `Material(topicId)`,
`Question(subjectSlug, status)`, `Test(subjectSlug, published)`, `TestAttempt(userId, testId, status)`,
`TestAttempt(testId, submittedAt)`, `Enrollment(platformSlug, status)`, `Notification(userId, readAt)`,
`Activity(userId, at desc)`, `Payment(userId, status)`, `Certificate(userId, subjectSlug)`.

## N+1

Lists are loaded with one query per table (`include` / `groupBy`) and joined in memory; per-user attempt counts and best
scores come from a single `groupBy`. Progress rules run on one scoped `CalcDb` per request, not per row.

## Migrations

* `prisma migrate dev --name <change>` creates a migration locally; commit it.
* Deployment runs `prisma migrate deploy` before the new build starts. Migrations within a release are additive.
* Never edit an applied migration; add a new one.
