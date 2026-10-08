# Production architecture

Status of this document: written at commit `0d10583` (all 15 learning phases done, demo data provider only) and kept up to date
by the production-hardening phases. The **Status** column in section 11 says what exists in code today.

## 1. Current architecture (what runs today)

```
Route / layout (server component)
   │  requireSession() / sessionOrNull()   ← authority for access (lib/auth/guards.ts)
   ▼
services.*  (src/services/contracts.ts)    ← the ONLY data boundary the UI knows
   ▼
src/services/mock/*   in-memory demo database (globalThis), resets on restart

Client components ──► server actions (Zod validation → role/permission check → services.*)
Files ──► /api/files/[id] (session + enrolment + unlocked-topic check) ──► StorageProvider
proxy.ts  = fast pre-check only (cookie signature / expiry / role claim); never the authority
```

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, next-intl (RU/EN/UZ).
- Two roles only: `ADMIN`, `STUDENT`. Two platforms: ACCA, FIA.
- Business rules that are pure functions live in `services/mock/calc.ts` (progress, unlocking) and `certs-core.ts`.

## 2. Demo architecture

`NEXT_PUBLIC_APP_MODE=demo` (default). Everything runs standalone:

| Concern | Demo implementation |
| --- | --- |
| Data | in-memory `Db` (`services/mock/db.ts`) seeded from `src/data/mock/*` |
| Auth | HMAC-signed httpOnly cookie, scrypt hashes, demo accounts shown on /login, secret derived/generated locally |
| Storage | `DemoStorageProvider` (OS temp dir) + generated seed media |
| Payments | read-only fixtures |
| Email | none (reset link is shown on screen) |
| Rate limits | per-process `Map` |

Demo is a first-class mode, not a shortcut: it is what the smoke suites run against.

## 3. Production architecture (target)

`NEXT_PUBLIC_APP_MODE=production`. Same UI, same contracts, different providers, all selected in **one** composition root
(`services/index.ts`, `services/storage/index.ts`, `services/payments`, `services/email`).

```
UI ─► services.* ─► Prisma services ─► PostgreSQL
                └► StorageProvider ─► S3-compatible private bucket
                └► PaymentProvider ─► checkout + signed webhook ─► Payment ─► Enrollment
                └► EmailProvider   ─► transactional email
                └► CertificatePdfProvider ─► server-side PDF
```

Production must never fall back to demo behaviour: no demo credentials, no in-memory business data, no demo payment success,
no auto-generated secrets. Startup validates the environment and fails fast (see `docs/DEPLOYMENT_MODES.md`).

## 4. Database boundaries

- PostgreSQL via Prisma. One schema, migrations in `prisma/migrations`. Seed (`prisma/seed.ts`) is **development/demo only**.
- Services are the only code that touches Prisma. Components, routes and actions never import `@prisma/client`.
- Public identifiers that appear in URLs (`subject.slug`, `topic.id`, `test.id`) are stable strings owned by the application.
- Soft delete (`deletedAt`) for content and users; hard cascade for per-user learning state.
- Derived numbers (progress, ranking, statistics) are computed from records; nothing is stored that can be derived,
  except explicit snapshots (certificate holder name, attempt review) that must not change retroactively.

## 5. Storage boundaries

- `StorageProvider` interface (`put/stat/open/delete/replace/markAttached`, + `exists`, signed access) — business code never names S3.
- Objects are private. The browser receives bytes only through `/api/files/[id]`, which checks session, role, enrolment and topic
  state first; short-lived signed URLs are an optimisation behind the same check, never a public link.
- Uploads are validated by extension allow-list, size cap and magic bytes; the client MIME type is ignored.

## 6. Auth boundaries

- Credentials sign-in, scrypt password hashes, single-use hashed reset tokens, signed httpOnly SameSite cookie, `tokenVersion`
  revocation. The session layer re-reads the user on every request (suspension / role changes apply immediately).
- `AUTH_SECRET` is mandatory in production and never generated. Open redirects are blocked by `safeNext()`.
- The proxy only rejects obviously unauthenticated requests early. Every page, action and route handler re-checks.

## 7. Payment boundaries

- A payment is **never** trusted from the browser. Flow: create `Payment(PENDING)` → provider checkout → provider webhook
  (server-side, signature verified, idempotent) → `PAID` → grant enrolment. Failure paths: `FAILED`, `CANCELLED`, `REFUNDED`.
- Demo provider is a separate class and is unreachable in production mode.

## 8. API boundaries

| Route | Purpose | Auth |
| --- | --- | --- |
| `/api/files/[id]` | protected material / question images (Range support) | session + enrolment |
| `/api/uploads` | admin uploads | ADMIN |
| `/api/certificates/[id]/pdf` | certificate PDF | owner or ADMIN |
| `/api/webhooks/payments` | provider callbacks | provider signature (no session) |
| `/verify/certificate/[number]` | public certificate verification page | none (minimal data only) |

Everything else is server components and server actions.

## 9. Security boundaries

Server-only: secrets, Prisma, storage credentials, password hashes, answer keys (never sent before submit), file bytes.
Client-visible: UI, translations, `NEXT_PUBLIC_APP_MODE`. Security headers are set in `next.config.ts`. Ownership checks (IDOR)
are server-side on every resource that carries a user id. See `docs/SECURITY_AUDIT.md`.

## 10. Migration strategy

1. Land the Prisma schema + migration + services next to the mock services (same contracts).
2. Select the provider with `DATA_PROVIDER=memory|prisma`; run the **same** smoke suites against both.
3. Production mode requires `DATA_PROVIDER=prisma`, real storage, real auth secret; demo-only code paths are disabled.
4. Deploy: `prisma migrate deploy`, then start. Seed only in development.
5. Rollback = redeploy previous build; migrations are additive within a release.

## 11. Status

| Area | Status at `0d10583` |
| --- | --- |
| Services contracts | done |
| Demo data provider | done |
| Prisma schema | stale (pre-dates question/test/certificate/notification models) |
| Prisma services | not implemented |
| Auth hardening for production | partial (demo secret fallback exists) |
| Storage (S3) | placeholder |
| Payments | fixtures only |
| Email | none |
| Certificate PDF | browser print only |
| Env validation | partial (`AUTH_SECRET`, app mode) |

The phases that follow update this table.
