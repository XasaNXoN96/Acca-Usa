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

## First administrator (production)

No demo account exists in production and **there is no public path to staff access**: registration only ever creates a student
(any `role` / `status` sent with the request is ignored — tested on both providers), and promoting someone is an administrator action.

```
ADMIN_EMAIL=owner@your-domain ADMIN_NAME="Owner" ADMIN_PASSWORD='…≥12 chars, letters + digits…' DATABASE_URL=… npm run admin:create
```

| Situation | Result |
| --- | --- |
| no administrator yet | the first administrator is created |
| e-mail already belongs to an administrator | operator **password reset**; all of that admin's sessions are revoked (`tokenVersion`) |
| e-mail belongs to a student | refused unless `ADMIN_PROMOTE_EXISTING=1` |
| another administrator already exists | refused unless `ADMIN_ALLOW_ADDITIONAL=1` — create further admins in **Admin → Students** instead |

The password is read from the environment (not argv, so it stays out of shell history and process lists), hashed with scrypt, and never printed.
Run the script from a trusted shell with database access, then unset the variable. Rules: `src/lib/admin-bootstrap.ts`; tests: `npm run test:admin`
(both providers) and `npm run test:production` (real CLI runs against a throw-away PostgreSQL).

## Two-step verification for administrators (TOTP)

Status: **implemented and tested against a local authenticator implementation** (RFC 6238 vectors + an independent TOTP generator in the browser tests). No SMS and no e-mail codes — only an authenticator app (any TOTP app) and one-time recovery codes.

| Rule | Where it is enforced |
|---|---|
| Mandatory for `ADMIN` in production mode (or with `MFA_REQUIRED=1`); optional in demo mode — but an administrator who enrolled is **always** challenged | `lib/auth/mfa-policy.ts` |
| A correct password is only the first factor: no `acca_session` cookie is issued, only a 5-minute `acca_mfa` challenge cookie signed under a **different domain** (`mfa.` prefix) so it can never be accepted as a session | `lib/auth/token.ts`, `loginAction` |
| The second factor is checked in the **session layer**, not in the login page: for an administrator with MFA a session token without the `m` claim yields *no session at all* on every route, file download and server action — there is no alternative login route to bypass | `lib/auth/session.ts` (`loadSession`) |
| An administrator who must enrol but has not yet gets no session from `getSession`; the admin layout renders **only** the enrolment screen for every `/admin/*` URL, and server actions fail closed | `app/admin/layout.tsx`, `getSessionForMfaSetup` |
| Replay protection: a code is accepted only for a time step newer than the last accepted one (conditional update, safe under concurrent requests); ±1 step clock drift | `lib/auth/totp.ts`, `services/*/mfa.ts` |
| Brute force: 6 failed codes / 10 min per account and 20 / 10 min per client address (shared `RateLimit` table on PostgreSQL); a successful sign-in clears the account counter | `verifyMfaAction` |
| Secret at rest: AES-256-GCM (key derived from `AUTH_SECRET` by HKDF) — a database dump alone cannot produce codes. Recovery codes: 10 per enrolment, stored only as keyed HMAC-SHA-256, single-use, consumed atomically | `lib/auth/mfa-crypto.ts` |
| Enrolling or resetting MFA bumps `tokenVersion` → every older session is revoked; the enrolling session is re-issued as verified | `services/*/mfa.ts`, `confirmMfaAction` |

Enrolment: **Admin → Security** (or automatically at first sign-in in production). The QR code and key are rendered on the server only for the signed-in administrator; the recovery codes are shown **once** (kept in memory only).

Lost device and recovery codes: an operator with database access runs

```bash
ADMIN_EMAIL=owner@example.com DATABASE_URL=… npm run admin:mfa-reset
```

which removes the factor and revokes the account's sessions; in production the administrator must enrol again at the next sign-in. There is intentionally **no web route** that turns MFA off.

Rotating `AUTH_SECRET` also makes stored TOTP secrets unreadable (all administrators must be reset) — plan it as a maintenance operation.

Limits / not verified: tested with a generic TOTP implementation, not with a specific vendor app on a real device; there is no "regenerate recovery codes" or "disable MFA" self-service yet; a stolen *verified* session cookie is still a session (httpOnly, SameSite=Lax, Secure in production, 7-day TTL).
