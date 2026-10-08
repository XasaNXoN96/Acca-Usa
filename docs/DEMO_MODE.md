# Demo mode

`NEXT_PUBLIC_APP_MODE=demo` (the default) makes ACCA USA run completely standalone: no database, no object storage,
no email provider, no payment provider. Production mode refuses to start until those providers exist.

## What is real in demo mode
- **Authentication**: registration, login, logout, forgot/reset password, roles, protected routes, rate limiting.
  Sessions are signed (HMAC-SHA256), `httpOnly`, `SameSite=Lax` cookies. Passwords are hashed with scrypt; there is no
  plaintext anywhere (not in the store, not in localStorage, not in logs). A suspended user, a role change or a password reset
  takes effect on the very next request (the user is re-read on every request; tokens carry a version).
- **Authorisation**: route proxy (fast pre-check) + server guards + per-action permission checks + Zod validation.
- **Server-side test engine**: answers are scored on the server; correct answers never reach the browser before submission;
  the timer deadline is owned by the server; drafts autosave server-side.
- **File upload**: type allow-list per material kind, size caps, magic-byte validation, session-checked and enrolment-checked
  downloads with HTTP Range support.

## What is demo-only
- **Data store**: in-memory (`src/services/mock/db.ts`). Everything except the seed accounts resets when the server restarts.
- **Storage**: `DemoStorageProvider` writes to the OS temp directory (`$TMPDIR/acca-usa-demo/uploads`). Unattached uploads are
  garbage-collected after an hour. `ProductionStorageProvider` is an unimplemented placeholder (S3-compatible plan in its header).
- **Forgot password**: no email is sent. The one-time reset link is shown on screen (only in demo mode, only for existing accounts).
- **Session secret**: generated once and kept in the OS temp dir when `AUTH_SECRET` is unset (never in the repo/browser).
- **Seeded accounts** (published on the login page in demo mode only):

| Role | Email | Password |
|---|---|---|
| Student | student@example.com | Student-Demo1 |
| Teacher | teacher@example.com | Teacher-Demo1 |
| Admin | admin@example.com | Admin-Demo1 |

  Only salted hashes of these passwords exist in the source.
- **Ranking, certificates, exams and payments** are fictional demo data (labelled "Demo data"); real payments are not enabled.
- **Enrolment is free** (no entitlement checks beyond "enrolled").

## Switching to production (next block)
1. Implement `services/prisma/*` against `services/contracts.ts` and swap them in `services/index.ts`.
2. Implement `ProductionStorageProvider` (private bucket + signed URLs).
3. Set `AUTH_SECRET`, `DATABASE_URL`; replace the in-memory rate limiter with a shared store; add an email provider for password reset.
4. Set `NEXT_PUBLIC_APP_MODE=production` (the guard in `services/index.ts` and `lib/auth/secret.ts` then enforces the real providers).
