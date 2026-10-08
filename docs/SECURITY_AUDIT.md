# Security audit

Scope: the application code in this repository at the commit that introduced this document. Method: code review of every
route handler / server action / service, plus the executable regression suites listed under each row. This is **not** a
third-party penetration test.

## Summary

| Area | Result | Evidence |
| --- | --- | --- |
| Authentication, sessions, cookies | ok | `docs/AUTH.md`, `smoke-security` 4, `smoke-roles`, `test:production` |
| Authorization (roles, permissions) | ok | `smoke-security` 3, `smoke-roles`, admin actions re-check on the server |
| IDOR (object-level access) | ok — matrix below | `smoke-security` 6-9, `smoke-certificates`, `smoke-payments` |
| Input validation | ok | Zod on every action + service re-validation; forms use the same schemas |
| Open redirect | ok | `safeNext()`; `smoke-security` 17 / 18 |
| CSRF | ok (defence in depth) | server actions: Next.js origin check; route handlers: `sameOrigin()`; cookie `SameSite=Lax` |
| XSS | ok, with a stated limit | React escaping; notes are plain text; e-mails escape every value; the only `dangerouslySetInnerHTML` is the constant theme-bootstrap script (no user data) |
| File upload / download | ok | `docs/STORAGE.md`, `smoke-security` 1-2, 7-9, 16, `test:storage` |
| Payments | ok | `docs/PAYMENTS.md`, `test:payments`, `smoke-payments`, `test:production` |
| Secrets handling | ok | env validated at startup, never echoed; server-only modules; no `NEXT_PUBLIC_` secrets |
| SQL injection | ok | Prisma parameterised queries; the only raw SQL is a tagged-template upsert (parameterised) and the dev-only reset |
| Rate limiting / brute force | ok | login, register, reset, upload, checkout, certificate lookup, webhook |
| Headers | ok, CSP is partial | `next.config.ts`, `smoke-security` 18 |
| Dependencies | 3 high advisories, CLI-only | see below |

## Authentication and sessions

Scrypt hashes, single-use hashed reset tokens, signed `httpOnly; SameSite=Lax; Secure(prod)` cookie, `tokenVersion` revocation
(password reset, role / status change and archive log the user out everywhere), session re-read on every request, generic
login errors with constant-work password check, rate limits shared across instances (`RateLimit` table). Details in `docs/AUTH.md`.

## Object-level authorization (IDOR) matrix

Identifiers in URLs / forms are never trusted to name the owner. Every row filters by the **session's** user id in the query
itself, so another user's object is indistinguishable from a missing one (404 / empty).

| Object | Entry points | Rule |
| --- | --- | --- |
| Certificate | `/certificates/[id]`, `/api/certificates/[id]/pdf` | owner or admin; others 404; revoked PDF 410 |
| Certificate (public) | `/verify/certificate/[number]` | minimal data (abbreviated holder, no e-mail / ids); rate limited |
| Test attempt / result | `/test/[id]/result?attempt=`, `tests.getResult/saveDraft/submit` | `userId` is part of every attempt query; the attempt id alone gives nothing |
| Payment | `/payments`, `/payments/demo-checkout/[id]`, `payments.getForUser` | `findFirst({ id, userId })`; the `?paid=` banner reads the stored status of the viewer's own payment |
| Notification | `notifications.markRead(userId, id)` | `updateMany({ id, userId })` |
| Material file | `/api/files/[id]` | session → file ↔ material ↔ platform → active enrolment → topic unlocked |
| Question image | `/api/files/[id]` | published question in a published test of an enrolled platform |
| Enrolment / access | actions | the user id comes from the session; admin grant / revoke need `manage_students` |
| Profile | `saveProfileAction` | edits only the session user |
| Admin resources | `saveResourceAction`, `setArchivedAction` | staff role + per-resource permission + Zod + not-found / duplicate handling |

## Validation and error behaviour

Every server action parses its input with Zod (unknown input never reaches a service), services re-check existence, ownership
and invariants (e.g. topic belongs to subject, last active admin cannot be removed, duplicate subject code / topic title,
future-only access expiry). Errors are returned as codes and translated at render time; unexpected exceptions reach the error
boundaries, which show only an opaque digest.

## Payments

Access only from a signature-verified provider event with a matching amount; idempotent per event id; forward-only state
machine; no demo success path in production; refunds withdraw access. Tests cover forged, stale, wrong-amount, replayed,
out-of-order and failing deliveries (`test:payments`, `test:production`).

## Uploads

Allow-listed extensions per kind, size caps, magic-byte sniffing, MIME derived from the extension, SVG / HTML rejected,
server-generated object keys, private bucket, `nosniff`, forced download for non-previewable types, staff-only with rate limit.

## Headers

`X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'; form-action 'self'`, HSTS in production. `X-Powered-By` removed.

## Known limits and recommendations

* **CSP has no `script-src`.** A strict nonce-based policy needs per-request nonces on Next.js's inline scripts; it was not
  added to avoid breaking the app without a browser matrix. React escaping + no raw HTML is the current XSS defence. `object-src`
  is deliberately absent (it would break the browser's PDF viewer in the material iframe).
* **Registration reveals whether an e-mail is registered** (`EMAIL_TAKEN`). Login and password reset do not. Accepted trade-off;
  the register endpoint is rate limited.
* **No MFA, no account lock-out beyond rate limits, no audit-log table** for admin actions.
* **No antivirus scan** on uploads (staff-only uploads, forced download for executable-ish types).
* **Webhook source IPs are not allow-listed**; authenticity relies on the HMAC signature (recommended practice).
* **Dependencies:** `npm audit --omit=dev` reports 3 *high* advisories, all the same chain (`prisma` CLI → `@prisma/config` →
  `deepmerge-ts` stack exhaustion on recursive object merges). It affects the Prisma **CLI** used for migrations at build /
  deploy time, not the request path, and the suggested "fix" is a breaking downgrade; track the next Prisma release.
* Stripe, S3 and SMTP integrations were verified against local stand-ins (signature algorithm, request shape, wire protocol),
  not against the vendors.
