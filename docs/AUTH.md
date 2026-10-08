# Authentication

Two roles only: `STUDENT` and `ADMIN`. Self-registration always creates a `STUDENT`; an administrator grants `ADMIN`.

## Flows

| Flow | Entry | Notes |
| --- | --- | --- |
| Register | `registerAction` | Zod re-validation, rate limit (10/h/IP), unique e-mail (DB constraint), scrypt hash, welcome notification, signs in |
| Login | `loginAction` | rate limit (8 / 10 min per IP + e-mail), constant-work password check even for unknown e-mails, generic error, suspended accounts refused |
| Logout | `logoutAction` | clears the cookie |
| Forgot password | `forgotPasswordAction` | identical answer whether or not the account exists; token returned to the caller only in **demo** mode, otherwise it goes out by e-mail (`docs/EMAIL.md`) |
| Reset password | `resetPasswordAction` | token is hashed (SHA-256) at rest, expires after 30 min, **single use** (conditional update), bumps `tokenVersion` (signs out every device) |

## Passwords

* `scrypt` with a per-password random salt (`src/lib/auth/password.ts`), format `s1$salt$hash`. No plaintext anywhere: not in
  the database, logs, responses or the repository. `passwordHash` never leaves the server (`User` DTOs omit it).
* Minimum strength is enforced by the Zod schema shared by the form and the server action.

## Session

* Signed token `payload.signature` (HMAC-SHA-256) in the `acca_session` cookie: `httpOnly`, `SameSite=Lax`, `Secure` in
  production, 7-day expiry. Claims: `uid`, `role`, `v` (token version), `exp`.
* The cookie is **only a pointer**: `getSession()` verifies the signature and then re-reads the user, so suspension, role
  change, archive or password reset apply on the very next request (`tokenVersion` mismatch → signed out).
* `proxy.ts` only rejects obviously unauthenticated requests early; every page, action and route handler re-checks with
  `requireSession()` / `sessionOrNull()`.
* Authorization lives on the server: roles come from the database row, never from the cookie claim or the request body.

## Secret

`AUTH_SECRET` (≥ 32 characters) comes from the environment. In production it is mandatory and the process refuses to start
without it (`src/lib/env.ts`); it is never generated automatically. Only demo mode may derive a local secret
(`src/lib/auth/secret.ts`).

## Redirects

`safeNext()` accepts only same-site relative paths. It rejects `//host`, backslashes, control characters (`/\t/host`),
absolute URLs and the auth pages themselves, so `?next=` cannot be used as an open redirect.

## Rate limiting

`src/lib/rate-limit.ts`: fixed windows. With `DATA_PROVIDER=prisma` the counter is one atomic upsert in the shared
`RateLimit` table, so limits hold across instances; in demo mode it is a per-process map. If the database is unavailable
the limiter falls back to the local counter rather than failing open.

## Demo vs production

Demo credentials are shown on the login page and exist only in the demo dataset (`NEXT_PUBLIC_APP_MODE=demo`). In
production there are no seeded accounts; the first administrator is created with `npm run admin:create` (see
`docs/DEPLOYMENT_MODES.md`). Auth.js is not used (removed) — the session layer above is the single mechanism.
