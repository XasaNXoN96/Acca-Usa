# Audit log

Status: **implemented and tested** (service on both providers, browser smoke on both providers, PostgreSQL protection and tamper detection in `test:production`). Not an external SIEM: events stay in the application's own database.

## What is recorded

| Source | Actions |
|---|---|
| Admin area (server actions) | `<resource>.create`, `<resource>.update` (field **names** only, plus role/status transitions for users and whether credentials were set — never values), `<resource>.archive` / `.restore`, `tests.publish` / `.unpublish` / `.duplicate`, `materials.version_restore`, `email.test_sent` |
| Authentication | `auth.login` (administrators; with/without MFA, method), `auth.mfa_failed`, `auth.mfa_locked`, `mfa.enabled`, `mfa.enroll_failed` |
| Payments | `payment.paid` / `.refunded` / `.failed` / `.cancelled` — actor `system` (the verified webhook), provider, amount, platform |
| Operator CLIs | `admin.created` / `.password_reset` / `.promoted` (`admin:create`), `mfa.reset` (`admin:mfa-reset`) — actor `cli` |

Each event: time (UTC), actor type/id/e-mail snapshot, action, target type/id, outcome (`success` / `denied` / `failed`), short redacted metadata, client address, previous hash, hash.

Not recorded: reads, student activity (that is the learner's own Activity feed), passwords, tokens, TOTP/recovery codes, submitted field values, file contents. Metadata keys that look sensitive (`pass`, `secret`, `token`, `code`, `hash`, `key`, `auth`, `cookie`, `card`, `signature`, `otp`) are replaced by `[redacted]` even if a caller passes them — callers must still pass facts only.

Records are written **after** the action succeeded. If the write itself fails the action is not undone; the server logs `audit.write_failed` (code only). That is a deliberate availability trade-off: check that line in your log alerts.

## Who can change it

* The service interface has `record`, `list`, `verify` — **no update, no delete**. The admin page `/admin/audit` is read-only (one GET filter form, no controls); students and guests are redirected.
* PostgreSQL triggers reject `UPDATE`, `DELETE` and `TRUNCATE` on `"AuditEvent"` for **every** role (migration `20261013100000_audit_log`). There is no foreign key to `User`, so deleting an account never removes its trail.
* Tamper evidence: every row stores `prevHash` and `hash = HMAC-SHA-256(key, canonical row incl. prevHash)`; rows are appended under a transaction-scoped advisory lock, so there is one linear chain across instances. Editing, deleting, inserting or re-ordering a row (for example by a database administrator who drops the trigger) breaks the chain from that row on, and without the key it cannot be recomputed.
  * `/admin/audit` re-verifies the latest 5 000 events on every view and shows a red banner on a break.
  * `AUTH_SECRET=… DATABASE_URL=… npm run audit:verify` checks the whole chain from the genesis row (exit 0 intact, 2 broken, 1 cannot verify). Run it on a schedule.
* Key: `AUDIT_CHAIN_SECRET` (≥ 32 chars) if set, otherwise `AUTH_SECRET`. **Rotating AUTH_SECRET without AUDIT_CHAIN_SECRET makes old events fail verification** — set `AUDIT_CHAIN_SECRET` to the current value *before* rotating `AUTH_SECRET`.
* Operator CLIs need the same key in their environment to append; without it they print a warning and write **no** event (they never pretend).

## Limits (honest)

* A superuser can disable the trigger **and** — only with the key — rewrite the whole chain. Without the key the change is detected; keep the chain key out of the database host's reach and ship `audit:verify` output / periodic head-hash snapshots to a system the database administrator cannot write to. No such external anchor is configured here.
* Deleting the *tail* of the chain (the newest rows) is not detectable from the chain alone; anchor the latest hash externally if that matters.
* The in-memory (demo) provider keeps events in process memory only and loses them on restart; it is for demos.
* Retention: nothing is deleted automatically. Events contain e-mail addresses and client IP addresses (personal data); define a retention period with your legal advisor — removing rows requires an operator to disable the trigger deliberately, which breaks the chain unless you archive and re-anchor first.
* Backups: restore tests must run `npm run audit:verify` afterwards (see docs/BACKUP_RESTORE.md once Phase 26 is done).
