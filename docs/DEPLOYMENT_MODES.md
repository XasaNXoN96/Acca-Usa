# Demo mode vs production mode

`NEXT_PUBLIC_APP_MODE` selects the mode. It is **compiled into the bundle** (`NEXT_PUBLIC_*`), so build and run with the same
value. The default is `demo`.

| | Demo (`demo`) | Production (`production`) |
| --- | --- | --- |
| Data | in-memory (`DATA_PROVIDER=memory`, default) or PostgreSQL seeded with `npm run db:seed` | PostgreSQL only (`DATA_PROVIDER=prisma`, enforced) |
| Accounts | Demo Student / Demo Admin shown on the login page | none; first admin via `npm run admin:create` |
| Storage | OS temp directory | private S3-compatible bucket |
| E-mail | recorded in memory, **nothing sent** (reset link also shown on screen) | SMTP |
| Payments | simulated checkout page (no money) | Stripe Checkout + signed webhook |
| Secrets | `AUTH_SECRET` optional (a local one is derived) | **all required**, validated at startup |
| Landing page | placeholder statistics + sample testimonials, labelled "Demo" | real catalogue counters only; no testimonials |
| Labels | "Demo mode / Demo data / Demo build" badges and notices | none |
| Settings / profile | demo settings form | settings come from the environment; profile saves for real |
| Certificates | "Demo build — sample certificate" line | no demo line |
| Cookies | `httpOnly`, `SameSite=Lax` | + `Secure`, HSTS header |

## What production refuses

* **Startup validation** (`src/instrumentation.ts` → `src/lib/env-check.ts`): the server does not start unless every variable
  below is present and sane. The error lists variable **names and reasons only** — values are never echoed.
* `DATA_PROVIDER` other than `prisma` → startup error (and `services/index.ts` throws as a second line of defence).
* Demo-only code is unreachable: `/payments/demo-checkout/*` is a 404, `completeDemoCheckout` answers `DEMO_ONLY`,
  `/api/webhooks/payments` cannot be satisfied by the demo provider, the demo-credential list is not passed to the login form,
  `prisma/seed.ts` and `prisma/reset-dev.ts` exit when production is detected.
* `DEMO_LOGIN=1` in production → startup error.

> The demo providers still ship inside the server bundle (the composition root imports both providers). They are inert in
> production; they are not served to browsers.

## Required environment (production)

```
NEXT_PUBLIC_APP_MODE=production
DATA_PROVIDER=prisma
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public
AUTH_SECRET=<≥ 32 random characters>        # openssl rand -base64 48
APP_URL=https://your-domain                  # https only
S3_BUCKET  S3_REGION  S3_ACCESS_KEY_ID  S3_SECRET_ACCESS_KEY   [S3_ENDPOINT]  [S3_FORCE_PATH_STYLE=1]
SMTP_HOST  SMTP_PORT  SMTP_USER  SMTP_PASSWORD  EMAIL_FROM   [SMTP_SECURE=1]
PAYMENT_SECRET_KEY  PAYMENT_WEBHOOK_SECRET
```

`.env.example` lists them. Nothing here may be prefixed `NEXT_PUBLIC_` except the mode.

## Deploying

```bash
npm ci
npm run build                      # same NEXT_PUBLIC_APP_MODE=production at build time
npx prisma migrate deploy          # applies prisma/migrations (additive within a release)
npm run db:bootstrap               # ACCA / FIA platforms + levels (idempotent, no demo data)
ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run admin:create   # first administrator
npm start
```

Then add subjects / topics / materials / tests in Admin. Set a platform price in Admin → Platforms (0 = free). Register
`/api/webhooks/payments` with the payment provider (`docs/PAYMENTS.md`). The bucket must have public access blocked
(`docs/STORAGE.md`). Rate limiting is shared across instances through the `RateLimit` table.

## Vercel (or any serverless host): what must be set

`NEXT_PUBLIC_APP_MODE` is inlined **at build time** — it must exist in the project's environment variables for the *Production*
environment before the build, not only at runtime. Everything below is validated when the server starts (`src/instrumentation.ts`
→ `src/lib/env-check.ts`); if anything is missing the whole site answers **HTTP 500** and the Vercel function log says
`Invalid environment (production mode): - NAME: reason` (names only, never values).

| Group | Variables |
| --- | --- |
| Mode / data | `NEXT_PUBLIC_APP_MODE=production`, `DATA_PROVIDER=prisma`, `DATABASE_URL` (use the provider's **pooled** connection string for serverless), `APP_URL` (public https URL), `AUTH_SECRET` (≥ 32 random chars; never rotate casually — see docs/AUTH.md) |
| Files | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_ENDPOINT` for R2/MinIO) |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` |
| Payments | `PAYMENT_SECRET_KEY` (`sk_test_…` until you decide otherwise), `PAYMENT_WEBHOOK_SECRET` (`whsec_…`); never `STRIPE_API_BASE` |
| Legal | `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_DATA_LOCATION` (+ optional `LEGAL_*`, `LEGAL_TEXTS_REVIEWED`) |
| Optional | `AUDIT_CHAIN_SECRET`, `MFA_REQUIRED` (production already forces MFA), media/STT variables |

**Database migrations are NOT run by Vercel or by `next build`.** Run `npx prisma migrate deploy` against the production database
from your pipeline (or your machine) **before** promoting a build that contains new migrations, then `npm run db:bootstrap` once,
then `npm run admin:create`. A build deployed against a database that lacks a migration fails at the first query that touches it —
reproduced on this code base: with `User.mfaSecretEnc` missing every sign-in (administrator *and* student) ends on "Something went
wrong" and the log shows `PrismaClientKnownRequestError … code: 'P2022' … The column User.mfaSecretEnc does not exist`; with the
`ConsentRecord` table missing, sign-in succeeds and the next page fails with `code: 'P2021'`. Check with
`npx prisma migrate status` (all migrations "applied") when you see that page.

## Verifying a production build

```bash
npm run build:prod-test        # production-mode bundle in .next-prod (does not touch .next)
npm run test:production        # throw-away database, real SMTP wire protocol, signed webhooks, demo-UI absence
```

`test:production` starts the server without configuration (must refuse), then with configuration against a freshly migrated
database: no demo UI, `Secure` cookies, welcome / reset mails through a local SMTP sink (single-use link, old sessions revoked),
`admin:create`, demo routes 404, and the real signed webhook path (forged / stale / wrong-amount rejected, one grant, replay
harmless, refund revokes). It does not talk to Stripe, S3 or a real mail server.

## Rollback

Redeploy the previous build. Migrations are additive within a release; a destructive migration ships with a note in its
folder name and a two-step release (stop reading → drop).
